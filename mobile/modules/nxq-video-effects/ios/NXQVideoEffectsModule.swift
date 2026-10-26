import ExpoModulesCore
import UIKit

public class NXQVideoEffectsModule: Module {
  private var editor: VideoEffectsController?

  public func definition() -> ModuleDefinition {
    Name("NXQVideoEffects")
    AsyncFunction("editAsync") { (uri: String, options: [String: Any], promise: Promise) in
      guard self.editor == nil else { promise.reject("EDITOR_BUSY", "Finish editing the current video first."); return }
      guard let url = URL(string: uri), url.isFileURL else {
        promise.reject("LOCAL_VIDEO_REQUIRED", "Choose a video downloaded to this iPhone first."); return
      }
      let path = url.resolvingSymlinksInPath().standardizedFileURL.path
      let roots = [NSHomeDirectory(), NSTemporaryDirectory()].map { URL(fileURLWithPath: $0).resolvingSymlinksInPath().path + "/" }
      guard roots.contains(where: { path.hasPrefix($0) }), FileManager.default.isReadableFile(atPath: path) else {
        promise.reject("VIDEO_UNAVAILABLE", "Select this video again from Photos."); return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController(), presenter.view.window != nil else {
        promise.reject("EDITOR_UNAVAILABLE", "Return to Create and try again."); return
      }
      let editor = VideoEffectsController(url: url, effects: VideoEffects(options))
      self.editor = editor
      editor.onFinish = { [weak self, weak editor] result in
        editor?.dismiss(animated: true) {
          self?.editor = nil
          promise.resolve(result)
        }
      }
      editor.modalPresentationStyle = .fullScreen
      presenter.present(editor, animated: true)
    }.runOnQueue(DispatchQueue.main)

    AsyncFunction("removeAsync") { (uri: String) in
      guard let url = URL(string: uri), url.isFileURL else { return }
      let resolved = url.resolvingSymlinksInPath().standardizedFileURL
      guard resolved.deletingLastPathComponent() == VideoEffectsController.outputDirectory.standardizedFileURL,
            resolved.lastPathComponent.hasPrefix("nxq-effects-"), resolved.pathExtension == "mp4" else { return }
      try? FileManager.default.removeItem(at: resolved)
    }
    OnDestroy { [weak self] in
      let editor = self?.editor
      DispatchQueue.main.async { editor?.closeEditor() }
    }
  }
}
