import { useEffect, useState, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

// Explicit storage keeps browser APIs out of server rendering and tolerates
// browsers where persistent storage is unavailable.
const layoutStorage = {
  getItem: (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Optional preference. */
    }
  },
};

function DesktopWorkspace({ children }: { children: [ReactNode, ReactNode] }) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "lectureloop-notes-slides",
    panelIds: ["notes", "slides"],
    storage: layoutStorage,
    onlySaveAfterUserInteractions: true,
  });

  // The panel library sets an inline `height: 100%` on the group, so the viewport-based
  // height must live on this wrapper (otherwise the panels grow to fit their content).
  // 9.5rem = site header + the compact class header + bottom padding.
  return (
    <div className="h-[calc(100dvh-9.5rem)] min-h-[480px] max-h-[1600px]">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel
          id="notes"
          defaultSize="50%"
          minSize="30%"
          className="h-full overflow-y-auto"
        >
          {children[0]}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          aria-label="Resize notes and slides"
          title="Resize notes and slides"
          className="mx-3 shrink-0 touch-none"
        />
        <ResizablePanel
          id="slides"
          defaultSize="50%"
          minSize="30%"
          className="h-full overflow-y-auto"
        >
          {children[1]}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export function AdjustableClassWorkspace({ children }: { children: [ReactNode, ReactNode] }) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <div className="min-w-0 lg:col-span-2">
      {desktop ? (
        <DesktopWorkspace>{children}</DesktopWorkspace>
      ) : (
        <div className="grid min-w-0 gap-6">{children}</div>
      )}
    </div>
  );
}
