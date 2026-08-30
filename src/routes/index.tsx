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
          "Fly, orbit, or work top-down with screen-locked X/Y/Z rulers. Face-snap stack solids, edit, measure, and save scenes locally.",
      },
      { property: "og:title", content: "Vector Bay — First-Person 3D CAD Sketchpad" },
      {
        property: "og:description",
        content:
          "Fly, orbit, or work top-down with screen-locked X/Y/Z rulers. Face-snap stack solids, edit, measure, and save scenes locally.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CadApp,
});
