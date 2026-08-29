import { createFileRoute } from "@tanstack/react-router";
import { CadApp } from "@/components/cad/CadApp";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Vector Bay — First-Person 3D CAD Sketchpad" },
      {
        name: "description",
        content:
          "Fly through 3D space with dual joysticks, aim a precision crosshair, and place solids on an X/Y/Z grid.",
      },
      { property: "og:title", content: "Vector Bay — First-Person 3D CAD Sketchpad" },
      {
        property: "og:description",
        content:
          "Fly through 3D space with dual joysticks, aim a precision crosshair, and place solids on an X/Y/Z grid.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CadApp,
});
