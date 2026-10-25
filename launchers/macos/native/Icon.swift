import Cocoa
let directory = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for (name, pixels) in [("icon_16x16",16),("icon_16x16@2x",32),("icon_32x32",32),("icon_32x32@2x",64),("icon_128x128",128),("icon_128x128@2x",256),("icon_256x256",256),("icon_256x256@2x",512),("icon_512x512",512),("icon_512x512@2x",1024)] {
    let rep = NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep:rep)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x:CGFloat(pixels)/1024,y:CGFloat(pixels)/1024)
    let dark = NSColor(red:0.09,green:0.10,blue:0.17,alpha:1)
    dark.setFill(); NSBezierPath(roundedRect:NSRect(x:48,y:48,width:928,height:928),xRadius:208,yRadius:208).fill()
    NSColor(red:1,green:0.69,blue:0.36,alpha:1).setFill()
    NSBezierPath(ovalIn:NSRect(x:218,y:218,width:550,height:620)).fill()
    dark.setFill(); NSBezierPath(ovalIn:NSRect(x:365,y:330,width:460,height:570)).fill()
    for (x,y,r) in [(725.0,285.0,80.0),(745,645,55),(530,200,40)] {
        let star = NSBezierPath(); star.move(to:NSPoint(x:x,y:y+r)); star.line(to:NSPoint(x:x+r*0.25,y:y+r*0.25)); star.line(to:NSPoint(x:x+r,y:y)); star.line(to:NSPoint(x:x+r*0.25,y:y-r*0.25)); star.line(to:NSPoint(x:x,y:y-r)); star.line(to:NSPoint(x:x-r*0.25,y:y-r*0.25)); star.line(to:NSPoint(x:x-r,y:y)); star.line(to:NSPoint(x:x-r*0.25,y:y+r*0.25)); star.close()
        NSColor(red:1,green:0.85,blue:0.60,alpha:1).setFill(); star.fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using:.png,properties:[:])!.write(to:directory.appendingPathComponent(name+".png"))
}
