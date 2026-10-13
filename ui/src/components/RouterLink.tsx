import { type AnchorHTMLAttributes, forwardRef } from "react";

import { Link } from "@tanstack/react-router";

import { useAlchemyBase } from "@/module/hooks";

/**
 * The `as` for every DLS component that takes an `href` (`NavItem`, `Tabs`, `Link`, `Button`). The
 * href is resolved against the module's base, so screens write `./images/${id}` and the same link
 * works standalone and inside a host that mounts the module under a prefix.
 */
const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ href, ...rest }, ref) => {
    const base = useAlchemyBase();
    // The href is a relative string the router's literal types cannot name; `"."` is one they can.
    return <Link ref={ref} from={base} to={(href ?? ".") as "."} {...rest} />;
  },
);

export default RouterLink;
