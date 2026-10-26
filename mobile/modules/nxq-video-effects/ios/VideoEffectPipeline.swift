import AVFoundation
import CoreImage
import Foundation

struct VideoEffects {
  static let looks = ["original", "golden", "cool", "vivid", "cinema", "mono"]
  var look: String = "original"
  var intensity: Double = 0.7
  var smooth: Double = 0
  var glow: Double = 0

  init(_ values: [String: Any] = [:]) {
    if let name = values["look"] as? String, Self.looks.contains(name) { look = name }
    func unit(_ key: String, _ fallback: Double) -> Double {
      guard let n = values[key] as? Double, n.isFinite else { return fallback }
      return min(1, max(0, n))
    }
    intensity = unit("intensity", 0.7)
    smooth = unit("smooth", 0)
    glow = unit("glow", 0)
  }
  var isOriginal: Bool { (look == "original" || intensity == 0) && smooth == 0 && glow == 0 }
  var dictionary: [String: Any] { ["look": look, "intensity": intensity, "smooth": smooth, "glow": glow] }
}

// Each composition owns its pipeline. Filters are local to a frame; only the
// low-resolution face detector is shared and serialized. No face data leaves RAM.
final class VideoEffectPipeline {
  private let lock = NSLock()
  private let detector = CIDetector(ofType: CIDetectorTypeFace, context: nil,
                                    options: [CIDetectorAccuracy: CIDetectorAccuracyLow])
  private var lastTime: Double = -.infinity
  private var lastExtent = CGRect.zero
  private var faces: [CGRect] = []

  func composition(asset: AVAsset, effects: VideoEffects) -> AVVideoComposition {
    AVVideoComposition(asset: asset, applyingCIFiltersWithHandler: { [self] request in
      autoreleasepool {
        let source = request.sourceImage
        let result = render(source, time: request.compositionTime.seconds, effects: effects)
        request.finish(with: result.cropped(to: source.extent), context: nil)
      }
    })
  }

  private func faceRects(_ image: CIImage, time: Double) -> [CGRect] {
    lock.lock()
    defer { lock.unlock() }
    // Detect at most ten times a second, at 320px, to bound preview/export work.
    if time < lastTime || time - lastTime >= 0.1 || image.extent != lastExtent {
      let scale = min(1, 320 / max(image.extent.width, image.extent.height))
      let features = detector?.features(in: image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))) ?? []
      faces = features.compactMap { ($0 as? CIFaceFeature)?.bounds.applying(CGAffineTransform(scaleX: 1 / scale, y: 1 / scale)) }
      lastTime = time
      lastExtent = image.extent
    }
    return faces
  }

  private func blend(_ foreground: CIImage, over background: CIImage, amount: Double) -> CIImage {
    let mask = CIImage(color: CIColor(red: CGFloat(amount), green: CGFloat(amount), blue: CGFloat(amount)))
      .cropped(to: background.extent)
    return foreground.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: background, kCIInputMaskImageKey: mask])
  }

  func render(_ source: CIImage, time: Double, effects: VideoEffects) -> CIImage {
    var image = source
    if effects.smooth > 0 || effects.glow > 0 {
      let bounds = faceRects(source, time: time)
      if !bounds.isEmpty {
        var mask = CIImage(color: .black).cropped(to: source.extent)
        for rect in bounds {
          let ellipse = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 0, y: 0), "inputRadius0": 0.52, "inputRadius1": 1.0,
            "inputColor0": CIColor.white, "inputColor1": CIColor.black
          ])!.outputImage!
            .transformed(by: CGAffineTransform(scaleX: rect.width * 0.52, y: rect.height * 0.60))
            .transformed(by: CGAffineTransform(translationX: rect.midX, y: rect.midY))
            .cropped(to: source.extent)
          mask = ellipse.applyingFilter("CIMaximumCompositing", parameters: [kCIInputBackgroundImageKey: mask])
        }
        var face = source
        if effects.smooth > 0 {
          let radius = max(source.extent.width, source.extent.height) / 1280 * 2.5
          let softened = source.clampedToExtent()
            .applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": 0.04, "inputSharpness": 0.4])
            .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: radius])
            .cropped(to: source.extent)
          face = blend(softened, over: source, amount: effects.smooth * 0.65)
        }
        if effects.glow > 0 {
          face = face.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: effects.glow * 0.22])
        }
        image = face.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: source, kCIInputMaskImageKey: mask])
      }
    }

    if effects.look != "original" && effects.intensity > 0 {
      var look = image
      switch effects.look {
      case "golden", "cool":
        let warm = effects.look == "golden"
        look = image.applyingFilter("CIColorMatrix", parameters: [
          "inputRVector": CIVector(x: warm ? 1.08 : 0.96, y: 0, z: 0, w: 0),
          "inputGVector": CIVector(x: 0, y: 1.01, z: 0, w: 0),
          "inputBVector": CIVector(x: 0, y: 0, z: warm ? 0.92 : 1.08, w: 0)
        ])
      case "vivid":
        look = image.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 1.35, kCIInputContrastKey: 1.08])
      case "cinema":
        look = image.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0.78, kCIInputContrastKey: 1.12])
      case "mono":
        look = image.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.05])
      default: break
      }
      image = blend(look, over: image, amount: effects.intensity)
    }
    return image.cropped(to: source.extent)
  }
}
