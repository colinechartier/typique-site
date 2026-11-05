import Vision
import CoreImage
import Foundation
// Usage : detoure <entrée.png> <sortie.png> ... (paires)
let a = CommandLine.arguments
var i = 1
let ctx = CIContext()
while i + 1 < a.count {
    let inp = a[i], out = a[i+1]; i += 2
    guard let ci = CIImage(contentsOf: URL(fileURLWithPath: inp)) else { print("illisible", inp); continue }
    let h = VNImageRequestHandler(ciImage: ci)
    let req = VNGenerateForegroundInstanceMaskRequest()
    do {
        try h.perform([req])
        guard let obs = req.results?.first else { print("rien", inp); continue }
        let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: h, croppedToInstancesExtent: false)
        try ctx.writePNGRepresentation(of: CIImage(cvPixelBuffer: buf), to: URL(fileURLWithPath: out), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
        print("ok", out)
    } catch { print("erreur", inp, error) }
}
