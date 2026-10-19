// Extrait les images d'une vidéo, recadrées « cover » au format voulu (ex. story 1080 × 1920).
// Usage : swift tools/extract_frames.swift <vidéo> <dossier_sortie> <fps> <durée_s> <largeur> <hauteur>
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 7 else {
    print("Usage : swift extract_frames.swift <vidéo> <dossier> <fps> <durée> <largeur> <hauteur>")
    exit(1)
}
let asset = AVAsset(url: URL(fileURLWithPath: args[1]))
let outDir = URL(fileURLWithPath: args[2])
let fps = Double(args[3])!, duration = Double(args[4])!
let outW = Int(args[5])!, outH = Int(args[6])!
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

let total = Int(duration * fps)
for i in 0..<total {
    autoreleasepool {
        let time = CMTime(seconds: Double(i) / fps, preferredTimescale: 600)
        let img = try! gen.copyCGImage(at: time, actualTime: nil)
        // Cadrage « cover » : on remplit tout le format de sortie en coupant ce qui dépasse
        let scale = max(Double(outW) / Double(img.width), Double(outH) / Double(img.height))
        let w = Double(img.width) * scale, h = Double(img.height) * scale
        let ctx = CGContext(data: nil, width: outW, height: outH, bitsPerComponent: 8, bytesPerRow: 0, space: sRGB,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.interpolationQuality = .high
        ctx.draw(img, in: CGRect(x: (Double(outW) - w) / 2, y: (Double(outH) - h) / 2, width: w, height: h))
        let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
        let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.92])!
        try! jpg.write(to: outDir.appendingPathComponent(String(format: "%05d.jpg", i)))
    }
}
print("OK : \(total) images \(outW)×\(outH)")
