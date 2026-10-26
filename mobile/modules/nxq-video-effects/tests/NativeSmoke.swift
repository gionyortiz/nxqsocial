import AVFoundation
import CoreImage
import Foundation

enum CheckFailure: Error { case failed(String) }
func check(_ ok: Bool, _ message: String) throws {
  if !ok { throw CheckFailure.failed(message) }
}

@main struct NativeSmoke {
  static func main() async throws {
    let context = CIContext(options: [.useSoftwareRenderer: true])
    let input = CIImage(color: CIColor(red: 0.6, green: 0.3, blue: 0.1)).cropped(to: CGRect(x: 0, y: 0, width: 32, height: 32))
    func pixels(_ image: CIImage) -> [UInt8] {
      var result = [UInt8](repeating: 0, count: 4)
      context.render(image, toBitmap: &result, rowBytes: 4, bounds: CGRect(x: 10, y: 10, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
      return result
    }
    let pipeline = VideoEffectPipeline()
    let original = pixels(input)
    try check(pixels(pipeline.render(input, time: 0, effects: VideoEffects())) == original, "Original must be unchanged")
    try check(pixels(pipeline.render(input, time: 0, effects: VideoEffects(["smooth": 1.0, "glow": 1.0]))) == original, "Beauty must not modify a frame with no faces")
    for look in VideoEffects.looks.dropFirst() {
      let result = pixels(pipeline.render(input, time: 0, effects: VideoEffects(["look": look, "intensity": 1.0])))
      try check(result != original, "Look must change pixels: \(look)")
      try check(result[3] == 255, "Look must preserve opacity")
      let zero = pixels(pipeline.render(input, time: 0, effects: VideoEffects(["look": look, "intensity": 0.0])))
      try check(zero == original, "Zero strength must keep original")
    }
    let mono = pixels(pipeline.render(input, time: 0, effects: VideoEffects(["look": "mono", "intensity": 1.0])))
    try check(abs(Int(mono[0]) - Int(mono[1])) <= 2 && abs(Int(mono[1]) - Int(mono[2])) <= 2, "Mono must render grayscale")
    let bounded = VideoEffects(["smooth": -4.0, "glow": Double.nan, "intensity": 10.0, "look": "unknown"])
    try check(bounded.smooth == 0 && bounded.glow == 0 && bounded.intensity == 1 && bounded.look == "original", "Clamp invalid settings")

    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let movie = directory.appendingPathComponent("source.mov")
    let writer = try AVAssetWriter(outputURL: movie, fileType: .mov)
    let track = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: 160, AVVideoHeightKey: 90])
    track.transform = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: 90, ty: 0)
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: track, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: 160, kCVPixelBufferHeightKey as String: 90, kCVPixelBufferCGImageCompatibilityKey as String: true])
    writer.add(track)
    try check(writer.startWriting(), "Fixture writer must start")
    writer.startSession(atSourceTime: .zero)
    for index in 0..<20 {
      while !track.isReadyForMoreMediaData {
        if writer.status == .failed { throw writer.error ?? CheckFailure.failed("Fixture writer failed") }
        try await Task.sleep(nanoseconds: 10_000_000)
      }
      var buffer: CVPixelBuffer?
      CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
      guard let buffer else { throw CheckFailure.failed("Fixture buffer") }
      context.render(input.transformed(by: CGAffineTransform(scaleX: 5, y: 3)), to: buffer)
      try check(adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(index), timescale: 10)), "Fixture frame append")
    }
    track.markAsFinished()
    writer.endSession(atSourceTime: CMTime(seconds: 2, preferredTimescale: 600))
    await writer.finishWriting()
    try check(writer.status == .completed, "Fixture movie must finish")

    // Add an audible PCM tone, so the export check detects dropped audio tracks.
    let soundURL = directory.appendingPathComponent("sound.caf")
    let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 88200)!
    buffer.frameLength = 88200
    for index in 0..<88200 { buffer.floatChannelData![0][index] = Float(sin(Double(index) * 2 * .pi * 440 / 44100) * 0.1) }
    do { let audioFile = try AVAudioFile(forWriting: soundURL, settings: format.settings); try audioFile.write(from: buffer) }
    let source = AVURLAsset(url: movie)
    let sound = AVURLAsset(url: soundURL)
    let composition = AVMutableComposition()
    let sourceTrack = try await source.loadTracks(withMediaType: .video)[0]
    let sourceAudio = try await sound.loadTracks(withMediaType: .audio)[0]
    let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
    let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    let timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: 2, preferredTimescale: 600))
    try videoTrack.insertTimeRange(timeRange, of: sourceTrack, at: .zero)
    videoTrack.preferredTransform = try await sourceTrack.load(.preferredTransform)
    try audioTrack.insertTimeRange(timeRange, of: sourceAudio, at: .zero)
    let output = directory.appendingPathComponent("filtered.mp4")
    let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPreset1280x720)!
    export.outputURL = output
    export.outputFileType = .mp4
    export.videoComposition = VideoEffectPipeline().composition(asset: composition, effects: VideoEffects(["look": "mono", "intensity": 1.0]))
    await export.export()
    try check(export.status == .completed, "Filtered MP4 export must finish: \(String(describing: export.error))")
    let result = AVURLAsset(url: output)
    let resultAudio = try await result.loadTracks(withMediaType: .audio)
    try check(!resultAudio.isEmpty, "Export must retain audio")
    let length = try await result.load(.duration).seconds
    try check(abs(length - 2) < 0.1, "Export must retain duration")
    let generator = AVAssetImageGenerator(asset: result)
    generator.appliesPreferredTrackTransform = true
    let frame = try generator.copyCGImage(at: CMTime(seconds: 1, preferredTimescale: 600), actualTime: nil)
    try check(frame.height > frame.width, "Portrait orientation must survive filtering")
    let saved = pixels(CIImage(cgImage: frame))
    try check(abs(Int(saved[0]) - Int(saved[1])) < 5 && abs(Int(saved[1]) - Int(saved[2])) < 5, "Saved video must contain the rendered filter")
    print("NXQ native effects PASS: pixel transforms, bounded settings, no-face preservation, MP4 export, portrait orientation, audio and duration.")
  }
}
