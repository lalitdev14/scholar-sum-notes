import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Pen, Undo2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Stroke = { points: { x: number; y: number; p: number }[]; erase: boolean };

export function HandwritingCanvas({
  onConvert,
  converting,
}: {
  onConvert: (dataUrl: string) => Promise<boolean> | void;
  converting?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [isEmpty, setIsEmpty] = useState(true);
  const [live, setLive] = useState(true);
  const liveRef = useRef(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  function redraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const stroke of all) {
      ctx.strokeStyle = stroke.erase ? "#ffffff" : "#141414";
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1]!;
        const b = stroke.points[i]!;
        ctx.lineWidth = stroke.erase ? 24 : Math.max(1.2, b.p * 4.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  async function convertNow(clearAfter: boolean) {
    const canvas = canvasRef.current;
    if (!canvas || busyRef.current || strokesRef.current.length === 0) return;
    busyRef.current = true;
    try {
      const ok = await onConvert(canvas.toDataURL("image/png"));
      if (clearAfter && ok !== false) clear();
    } finally {
      busyRef.current = false;
    }
  }

  function scheduleLiveConvert() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!liveRef.current) return;
    idleTimer.current = setTimeout(() => void convertNow(true), 1600);
  }

  useEffect(() => {
    liveRef.current = live;
    if (!live && idleTimer.current) clearTimeout(idleTimer.current);
  }, [live]);

  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      p: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Ignore finger scrolling when a stylus is in use; pen and mouse draw.
    e.currentTarget.setPointerCapture(e.pointerId);
    const erase = tool === "eraser" || e.buttons === 32;
    drawingRef.current = { points: [pos(e)], erase };
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const events = typeof e.nativeEvent.getCoalescedEvents === "function"
      ? e.nativeEvent.getCoalescedEvents()
      : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const ev of events) {
      drawingRef.current.points.push({
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
        p: ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5,
      });
    }
    redraw();
  }

  function up() {
    if (drawingRef.current && drawingRef.current.points.length > 1) {
      strokesRef.current.push(drawingRef.current);
      setIsEmpty(false);
    }
    drawingRef.current = null;
    redraw();
    scheduleLiveConvert();
  }

  function undo() {
    strokesRef.current.pop();
    setIsEmpty(strokesRef.current.length === 0);
    redraw();
  }

  function clear() {
    strokesRef.current = [];
    setIsEmpty(true);
    redraw();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={tool === "pen" ? "default" : "outline"}
          onClick={() => setTool("pen")}
        >
          <Pen className="mr-2 h-4 w-4" /> Pen
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tool === "eraser" ? "default" : "outline"}
          onClick={() => setTool("eraser")}
        >
          <Eraser className="mr-2 h-4 w-4" /> Eraser
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={undo} disabled={isEmpty}>
          <Undo2 className="mr-2 h-4 w-4" /> Undo
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={isEmpty}>
          Clear
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="live-convert" checked={live} onCheckedChange={setLive} />
          <Label htmlFor="live-convert" className="text-xs text-muted-foreground">
            Live convert
          </Label>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={isEmpty || converting}
          onClick={() => void convertNow(true)}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {converting ? "Converting…" : "Convert to text"}
        </Button>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        className="mt-4 h-[460px] w-full touch-none rounded-lg border border-border bg-white"
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Write with an Apple Pencil or stylus on iPad — pressure is captured. With live convert on,
        each line is turned into typed text about a second after you stop writing, and the canvas
        clears so you can keep going.
      </p>
    </div>
  );
}
