Pod::Spec.new do |s|
  s.name = 'NXQVideoEffects'
  s.version = '1.0.0'
  s.summary = 'On-device video looks and face-aware softening for NXQ Social'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'NexaQuantum'
  s.homepage = 'https://nxqsocial.com'
  s.source = { :git => 'https://nxqsocial.com' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'AVKit', 'CoreImage', 'UIKit'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
