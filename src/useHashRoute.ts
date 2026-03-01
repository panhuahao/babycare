import { useEffect, useState } from "react";
import { parseRoute, Route } from "./routes";

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) {
      window.location.hash = "#/home";
    } else {
      onChange();
    }
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return route;
}

