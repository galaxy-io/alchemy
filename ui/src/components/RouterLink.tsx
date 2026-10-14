import { type AnchorHTMLAttributes, forwardRef } from "react";

import { Link } from "@tanstack/react-router";

import { useAlchemyBase } from "@/module/hooks";

const RouterLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ href, ...rest }, ref) => {
    const base = useAlchemyBase();
    return <Link ref={ref} from={base} to={(href ?? ".") as "."} {...rest} />;
  },
);

export default RouterLink;
