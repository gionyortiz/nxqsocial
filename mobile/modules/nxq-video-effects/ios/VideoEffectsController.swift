import AVFoundation
import AVKit
import UIKit

final class VideoEffectsController: UIViewController {
  static var outputDirectory: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("NXQVideoEffects", isDirectory: true)
  }

  var onFinish: (([String: Any]) -> Void)?
  private let url: URL
  private let asset: AVURLAsset
  private var effects: VideoEffects
  private let playerView = AVPlayerViewController()
  private let player = AVPlayer()
  private let accent = UIColor(red: 0.68, green: 0.30, blue: 0.98, alpha: 1)
  private let status = UILabel()
  private let cancelButton = UIButton(type: .system)
  private let useButton = UIButton(type: .system)
  private let compareButton = UIButton(type: .system)
  private let progress = UIProgressView(progressViewStyle: .default)
  private var lookButtons: [UIButton] = []
  private var sliders: [UISlider] = []
  private var valueLabels: [UILabel] = []
  private var controls: [UIControl] = []
  private var observerTokens: [NSObjectProtocol] = []
  private var playerObservation: NSKeyValueObservation?
  private var loadTask: Task<Void, Never>?
  private var previewTask: DispatchWorkItem?
  private var exportSession: AVAssetExportSession?
  private var progressTimer: Timer?
  private var originalPreview = false
  private var finished = false
  private var ready = false
  private var sourceHasAudio = false
  private var duration: Double = 0
  private var width: CGFloat = 0
  private var height: CGFloat = 0

  init(url: URL, effects: VideoEffects) {
    self.url = url
    self.asset = AVURLAsset(url: url)
    self.effects = effects
    super.init(nibName: nil, bundle: nil)
  }
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func viewDidLoad() {
    super.viewDidLoad()
    overrideUserInterfaceStyle = .dark
    view.backgroundColor = UIColor(red: 0.04, green: 0.05, blue: 0.07, alpha: 1)
    view.tintColor = accent
    buildInterface()
    observerTokens.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
      guard let self, let item = note.object as? AVPlayerItem, item === self.player.currentItem,
            self.exportSession == nil, !self.finished else { return }
      self.player.seek(to: .zero)
      self.player.play()
    })
    observerTokens.append(NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.player.pause()
      if self?.exportSession != nil {
        self?.status.text = "Export paused. Keep NXQ open and tap Use video to retry."
        self?.exportSession?.cancelExport()
      }
    })
    loadTask = Task { [weak self] in
      guard let self else { return }
      await self.prepare()
    }
  }

  private func label(_ text: String, size: CGFloat = 14, weight: UIFont.Weight = .regular) -> UILabel {
    let label = UILabel()
    label.text = text
    label.textColor = .white
    label.font = UIFontMetrics.default.scaledFont(for: .systemFont(ofSize: size, weight: weight))
    label.adjustsFontForContentSizeCategory = true
    label.numberOfLines = 0
    return label
  }

  private func button(_ title: String, action: Selector) -> UIButton {
    let button = UIButton(type: .system)
    styleButton(button, title: title, action: action)
    return button
  }
  private func styleButton(_ button: UIButton, title: String, action: Selector) {
    var configuration = UIButton.Configuration.filled()
    configuration.title = title
    configuration.baseBackgroundColor = UIColor(white: 0.13, alpha: 1)
    configuration.baseForegroundColor = .white
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
    button.configuration = configuration
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    button.addTarget(self, action: action, for: .touchUpInside)
  }

  private func buildInterface() {
    let main = UIStackView()
    main.axis = .vertical
    main.spacing = 12
    main.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(main)
    NSLayoutConstraint.activate([
      main.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      main.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      main.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      main.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8)
    ])
    styleButton(cancelButton, title: "Cancel", action: #selector(cancelTapped))
    styleButton(useButton, title: "Use video", action: #selector(useTapped))
    useButton.configuration?.baseBackgroundColor = accent
    useButton.isEnabled = false
    let spacer = UIView()
    let header = UIStackView(arrangedSubviews: [cancelButton, spacer, useButton])
    header.spacing = 8
    main.addArrangedSubview(header)
    main.addArrangedSubview(label("Filters & beauty", size: 25, weight: .bold))

    addChild(playerView)
    playerView.player = player
    playerView.allowsPictureInPicturePlayback = false
    playerView.videoGravity = .resizeAspect
    playerView.view.backgroundColor = .black
    playerView.view.layer.cornerRadius = 18
    playerView.view.clipsToBounds = true
    main.addArrangedSubview(playerView.view)
    playerView.didMove(toParent: self)
    playerView.view.heightAnchor.constraint(greaterThanOrEqualToConstant: 120).isActive = true
    playerView.view.setContentHuggingPriority(.defaultLow, for: .vertical)

    let scroll = UIScrollView()
    scroll.alwaysBounceVertical = true
    main.addArrangedSubview(scroll)
    let panelHeight = scroll.heightAnchor.constraint(equalToConstant: 290)
    panelHeight.priority = .defaultHigh
    panelHeight.isActive = true
    let panel = UIStackView()
    panel.axis = .vertical
    panel.spacing = 12
    panel.translatesAutoresizingMaskIntoConstraints = false
    scroll.addSubview(panel)
    NSLayoutConstraint.activate([
      panel.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      panel.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      panel.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      panel.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      panel.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor)
    ])

    let looksScroll = UIScrollView()
    looksScroll.showsHorizontalScrollIndicator = false
    let looks = UIStackView()
    looks.spacing = 8
    looks.translatesAutoresizingMaskIntoConstraints = false
    looksScroll.addSubview(looks)
    NSLayoutConstraint.activate([
      looks.leadingAnchor.constraint(equalTo: looksScroll.contentLayoutGuide.leadingAnchor),
      looks.trailingAnchor.constraint(equalTo: looksScroll.contentLayoutGuide.trailingAnchor),
      looks.topAnchor.constraint(equalTo: looksScroll.contentLayoutGuide.topAnchor),
      looks.bottomAnchor.constraint(equalTo: looksScroll.contentLayoutGuide.bottomAnchor),
      looks.heightAnchor.constraint(equalTo: looksScroll.frameLayoutGuide.heightAnchor)
    ])
    for (index, look) in VideoEffects.looks.enumerated() {
      let chip = button(look.capitalized, action: #selector(lookTapped(_:)))
      chip.tag = index
      looks.addArrangedSubview(chip)
      lookButtons.append(chip)
      controls.append(chip)
    }
    looksScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    panel.addArrangedSubview(looksScroll)
    for (index, title) in ["Filter strength", "Smooth", "Glow"].enumerated() {
      let text = label(title, weight: .semibold)
      text.widthAnchor.constraint(equalToConstant: 108).isActive = true
      let slider = UISlider()
      slider.tag = index
      slider.minimumValue = 0
      slider.maximumValue = 1
      slider.minimumTrackTintColor = accent
      slider.accessibilityLabel = title
      slider.addTarget(self, action: #selector(sliderChanged(_:)), for: .valueChanged)
      slider.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
      let value = label("0", size: 12)
      value.textAlignment = .right
      value.widthAnchor.constraint(equalToConstant: 30).isActive = true
      let row = UIStackView(arrangedSubviews: [text, slider, value])
      row.alignment = .center
      row.spacing = 8
      panel.addArrangedSubview(row)
      sliders.append(slider)
      valueLabels.append(value)
      controls.append(slider)
    }
    let detail = label("Smooth and Glow soften and brighten detected faces. Everything is processed on this iPhone.", size: 12)
    detail.textColor = UIColor(white: 0.7, alpha: 1)
    panel.addArrangedSubview(detail)
    styleButton(compareButton, title: "Compare original", action: #selector(compareTapped))
    let reset = button("Reset", action: #selector(resetTapped))
    controls.append(contentsOf: [compareButton, reset])
    let actions = UIStackView(arrangedSubviews: [compareButton, reset])
    actions.spacing = 8
    actions.distribution = .fillEqually
    panel.addArrangedSubview(actions)
    progress.progressTintColor = accent
    progress.isHidden = true
    main.addArrangedSubview(progress)
    status.textColor = UIColor(white: 0.7, alpha: 1)
    status.font = .preferredFont(forTextStyle: .footnote)
    status.numberOfLines = 0
    status.text = "Opening video…"
    status.isAccessibilityElement = true
    main.addArrangedSubview(status)
    updateControls()
    controls.forEach { $0.isEnabled = false }
  }

  private func prepare() async {
    do {
      let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= 200 * 1024 * 1024 else {
        throw EditorError.invalidSize
      }
      let duration = try await asset.load(.duration).seconds
      let tracks = try await asset.loadTracks(withMediaType: .video)
      guard let track = tracks.first, duration.isFinite, duration > 0, duration <= 600,
            try await asset.load(.isPlayable), !(try await asset.load(.hasProtectedContent)) else { throw EditorError.invalidVideo }
      let naturalSize = try await track.load(.naturalSize)
      let transform = try await track.load(.preferredTransform)
      let oriented = CGRect(origin: .zero, size: naturalSize).applying(transform)
      sourceHasAudio = !(try await asset.loadTracks(withMediaType: .audio)).isEmpty
      guard !Task.isCancelled, !finished else { return }
      self.duration = duration
      width = abs(oriented.width)
      height = abs(oriented.height)
      ready = true
      let item = AVPlayerItem(asset: asset)
      player.replaceCurrentItem(with: item)
      playerObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
        if item.status == .failed {
          DispatchQueue.main.async { self?.showError("This video cannot be previewed. Try a different clip from Photos.") }
        }
      }
      updatePreview()
      setExporting(false)
      status.text = "Preview your look, then tap Use video."
      player.play()
    } catch {
      guard !finished, !Task.isCancelled else { return }
      status.text = "This clip could not be opened. Cancel to choose another video."
      showError(error is EditorError ? error.localizedDescription : "This video could not be opened. Download it in Photos and try again.")
    }
  }

  private func updateControls() {
    for (index, button) in lookButtons.enumerated() {
      let selected = VideoEffects.looks[index] == effects.look
      button.configuration?.baseBackgroundColor = selected ? accent : UIColor(white: 0.13, alpha: 1)
      button.accessibilityTraits = selected ? [.button, .selected] : [.button]
    }
    for (index, amount) in [effects.intensity, effects.smooth, effects.glow].enumerated() {
      sliders[index].value = Float(amount)
      valueLabels[index].text = "\(Int((amount * 100).rounded()))"
      sliders[index].accessibilityValue = "\(Int((amount * 100).rounded())) percent"
    }
    compareButton.configuration?.title = originalPreview ? "Show effects" : "Compare original"
    compareButton.accessibilityValue = originalPreview ? "Original preview" : "Effects preview"
  }

  @objc private func lookTapped(_ button: UIButton) {
    effects.look = VideoEffects.looks[button.tag]
    originalPreview = false
    updateControls()
    schedulePreview()
  }
  @objc private func sliderChanged(_ slider: UISlider) {
    switch slider.tag {
    case 0: effects.intensity = Double(slider.value)
    case 1: effects.smooth = Double(slider.value)
    default: effects.glow = Double(slider.value)
    }
    originalPreview = false
    updateControls()
    schedulePreview()
  }
  @objc private func compareTapped() {
    originalPreview.toggle()
    updateControls()
    updatePreview()
  }
  @objc private func resetTapped() {
    effects = VideoEffects()
    originalPreview = false
    updateControls()
    updatePreview()
  }
  private func schedulePreview() {
    previewTask?.cancel()
    let task = DispatchWorkItem { [weak self] in self?.updatePreview() }
    previewTask = task
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: task)
  }
  private func updatePreview() {
    previewTask?.cancel()
    guard ready, !finished, exportSession == nil, let item = player.currentItem else { return }
    let snapshot = originalPreview ? VideoEffects() : effects
    item.videoComposition = snapshot.isOriginal ? nil : VideoEffectPipeline().composition(asset: asset, effects: snapshot)
    if player.rate == 0 {
      player.seek(to: player.currentTime(), toleranceBefore: .zero, toleranceAfter: .zero)
    }
    status.text = originalPreview ? "Original preview · your effects are saved when you tap Use video." : "Preview your look, then tap Use video."
  }

  private func setExporting(_ exporting: Bool) {
    controls.forEach { $0.isEnabled = ready && !exporting }
    useButton.isEnabled = ready && !exporting
    cancelButton.configuration?.title = exporting ? "Cancel export" : "Cancel"
    progress.isHidden = !exporting
    UIApplication.shared.isIdleTimerDisabled = exporting
  }
  @objc private func cancelTapped() {
    if let session = exportSession {
      session.cancelExport()
    } else {
      closeEditor()
    }
  }
  func closeEditor() {
    guard !finished else { return }
    finished = true
    loadTask?.cancel()
    previewTask?.cancel()
    exportSession?.cancelExport()
    progressTimer?.invalidate()
    player.pause()
    player.replaceCurrentItem(with: nil)
    UIApplication.shared.isIdleTimerDisabled = false
    onFinish?(["canceled": true])
    onFinish = nil
  }

  @objc private func useTapped() {
    guard ready, !finished, exportSession == nil else { return }
    player.pause()
    previewTask?.cancel()
    if effects.isOriginal {
      let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
      finish(uri: url, width: width, height: height, size: size)
      return
    }
    do {
      try FileManager.default.createDirectory(at: Self.outputDirectory, withIntermediateDirectories: true)
      let output = Self.outputDirectory.appendingPathComponent("nxq-effects-\(UUID().uuidString).mp4")
      guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1280x720),
            session.supportedFileTypes.contains(.mp4) else { throw EditorError.exportUnavailable }
      session.outputURL = output
      session.outputFileType = .mp4
      session.shouldOptimizeForNetworkUse = true
      session.metadata = []
      // Preview and export intentionally share the same Core Image pipeline.
      session.videoComposition = VideoEffectPipeline().composition(asset: asset, effects: effects)
      exportSession = session
      setExporting(true)
      status.text = "Saving effects… Keep NXQ open."
      progress.progress = 0
      progressTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
        guard let self, let session = self.exportSession else { return }
        self.progress.progress = session.progress
        self.status.text = "Saving effects · \(Int(session.progress * 100))% · Keep NXQ open"
      }
      session.exportAsynchronously { [weak self] in
        DispatchQueue.main.async {
          guard let self else { try? FileManager.default.removeItem(at: output); return }
          self.progressTimer?.invalidate()
          self.progressTimer = nil
          if self.finished {
            try? FileManager.default.removeItem(at: output)
            return
          }
          if session.status != .completed {
            try? FileManager.default.removeItem(at: output)
            self.exportSession = nil
            self.setExporting(false)
            self.status.text = "Your original video and settings are kept. Tap Use video to retry."
            if session.status != .cancelled { self.showError("Could not save this video. Free some space on your iPhone and try again.") }
            return
          }
          Task { await self.validateExport(output) }
        }
      }
    } catch {
      exportSession = nil
      setExporting(false)
      showError("Could not prepare this video. Free some space on your iPhone and try again.")
    }
  }

  private func validateExport(_ output: URL) async {
    do {
      let result = AVURLAsset(url: output)
      let tracks = try await result.loadTracks(withMediaType: .video)
      guard let track = tracks.first else { throw EditorError.exportUnavailable }
      let outputDuration = try await result.load(.duration).seconds
      let audio = try await result.loadTracks(withMediaType: .audio)
      let size = try output.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard outputDuration.isFinite, abs(outputDuration - duration) <= 0.5,
            !sourceHasAudio || !audio.isEmpty, size > 0 else { throw EditorError.exportUnavailable }
      guard size <= 200 * 1024 * 1024 else { throw EditorError.invalidSize }
      let natural = try await track.load(.naturalSize)
      let transform = try await track.load(.preferredTransform)
      let frame = CGRect(origin: .zero, size: natural).applying(transform)
      guard !finished else { try? FileManager.default.removeItem(at: output); return }
      exportSession = nil
      finish(uri: output, width: abs(frame.width), height: abs(frame.height), size: size)
    } catch {
      try? FileManager.default.removeItem(at: output)
      exportSession = nil
      guard !finished else { return }
      setExporting(false)
      showError(error is EditorError ? error.localizedDescription : "The video could not be saved completely. Your original is still available.")
    }
  }

  private func finish(uri: URL, width: CGFloat, height: CGFloat, size: Int) {
    guard !finished else { return }
    finished = true
    player.pause()
    player.replaceCurrentItem(with: nil)
    UIApplication.shared.isIdleTimerDisabled = false
    onFinish?(["canceled": false, "uri": uri.absoluteString, "width": width, "height": height,
               "duration": duration * 1000, "size": size, "effects": effects.dictionary])
    onFinish = nil
  }
  private func showError(_ message: String) {
    status.text = message
    guard !finished, presentedViewController == nil, UIApplication.shared.applicationState == .active else { return }
    let alert = UIAlertController(title: "Video effects", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    present(alert, animated: true)
  }
  deinit {
    observerTokens.forEach { NotificationCenter.default.removeObserver($0) }
    playerObservation?.invalidate()
    previewTask?.cancel()
    progressTimer?.invalidate()
    exportSession?.cancelExport()
  }
}

private enum EditorError: LocalizedError {
  case invalidSize, invalidVideo, exportUnavailable
  var errorDescription: String? {
    switch self {
    case .invalidSize: return "Choose a video under 200 MB. Your original has not been changed."
    case .invalidVideo: return "Choose a playable video no longer than 10 minutes."
    case .exportUnavailable: return "This video could not be saved with its original sound and duration. Try another clip."
    }
  }
}

