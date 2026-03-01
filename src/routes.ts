export type Route =
  | { name: "home" }
  | { name: "stats" }
  | { name: "mine" }
  | { name: "history" };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const seg = path.split("?")[0]?.split("/").filter(Boolean)[0] ?? "home";
  switch (seg) {
    case "stats":
      return { name: "stats" };
    case "calendar":
      return { name: "stats" };
    case "mine":
      return { name: "mine" };
    case "history":
      return { name: "history" };
    default:
      return { name: "home" };
  }
}

export function toHash(route: Route): string {
  return `#/${route.name}`;
}

export function navTo(route: Route) {
  window.location.hash = toHash(route);
}
