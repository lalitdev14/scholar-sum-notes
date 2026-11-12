# Agent notes

- Keep desktop notes/slide resizing in AdjustableClassWorkspace using the existing resizable UI components; persist only the split locally and stack panels below the desktop breakpoint to preserve mobile usability without changing class data.
- Every page (and the site header/footer) uses the same container: `mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10 xl:px-16`, so the logo, page titles and content share one left edge. Narrow content (forms, articles) sits inside it with its own max width (e.g. `[&>*]:max-w-4xl`) rather than a narrower centred container.
