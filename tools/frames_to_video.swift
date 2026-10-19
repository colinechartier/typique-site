// Assemble une suite d'images (JPG/PNG, triées par nom) en vidéo H.264, sans son.
// Usage : swift tools/frames_to_video.swift <dossier_images> <sortie.mp4> <images/seconde> <débit bits/s>
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 5 else {
    print("Usage : swift frames_to_video.swift <dossier> <sortie.mp4> <fps> <débit>")
    exit(1)
}
let dir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])
let fps = Int32(args[3])!
let bitrate = Int(args[4])!

let files = try! FileManager.default.contentsOfDirectory(atPath: dir.path)
    .filter { $0.hasSuffix(".jpg") || $0.hasSuffix(".png") }
    .sorted()
guard let first = files.first,
      let firstSrc = CGImageSourceCreateWithURL(dir.appendingPathComponent(first) as CFURL, nil),
      let firstImg = CGImageSourceCreateImageAtIndex(firstSrc, 0, nil) else {
    print("Aucune image trouvée")
    exit(1)
}
let width = firstImg.width, height = firstImg.height
try? FileManager.default.removeItem(at: out)

let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoMaxKeyFrameIntervalKey: Int(fps) * 2,
        AVVideoExpectedSourceFrameRateKey: Int(fps),
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

for (i, name) in files.enumerated() {
    autoreleasepool {
        while !input.isReadyForMoreMediaData { usleep(2000) }
        let src = CGImageSourceCreateWithURL(dir.appendingPathComponent(name) as CFURL, nil)!
        let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
        let pb = buffer!
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: sRGB,
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: Int64(i), timescale: fps))
    }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed {
    print("Erreur : \(String(describing: writer.error))")
    exit(1)
}
print("OK : \(files.count) images, \(width)×\(height), \(fps) i/s")
