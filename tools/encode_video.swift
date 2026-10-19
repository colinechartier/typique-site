// Ré-encode la vidéo hero en H.264 (sans audio, fast start) + extrait une image d'aperçu (poster).
// Usage : swift tools/encode_video.swift <source.mp4> <sortie.mp4> <largeur> <hauteur> <débit bits/s> [poster.jpg]
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 6 else {
    print("Usage : swift encode_video.swift <source> <sortie> <largeur> <hauteur> <débit> [poster.jpg]")
    exit(1)
}
let src = URL(fileURLWithPath: args[1])
let dst = URL(fileURLWithPath: args[2])
let width = Int(args[3])!, height = Int(args[4])!, bitrate = Int(args[5])!
try? FileManager.default.removeItem(at: dst)

let asset = AVAsset(url: src)
let track = asset.tracks(withMediaType: .video)[0]
let fps = track.nominalFrameRate

let reader = try! AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
])
reader.add(output)

let writer = try! AVAssetWriter(outputURL: dst, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
        AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
    ],
])
input.expectsMediaDataInRealTime = false
writer.add(input)

reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let done = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: DispatchQueue(label: "encode")) {
    while input.isReadyForMoreMediaData {
        if let sample = output.copyNextSampleBuffer() {
            input.append(sample)
        } else {
            input.markAsFinished()
            writer.finishWriting { done.signal() }
            return
        }
    }
}
done.wait()
if writer.status != .completed {
    print("Erreur d'encodage : \(String(describing: writer.error))")
    exit(1)
}

if args.count >= 7 {
    let gen = AVAssetImageGenerator(asset: asset)
    gen.maximumSize = CGSize(width: width, height: height)
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    let cg = try! gen.copyCGImage(at: .zero, actualTime: nil)
    let rep = NSBitmapImageRep(cgImage: cg)
    let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.6])!
    try! jpg.write(to: URL(fileURLWithPath: args[6]))
}
print("OK")
