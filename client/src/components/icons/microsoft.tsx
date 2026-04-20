import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number | string;
  strokeWidth?: number;
};

function Base({
  size = 24,
  strokeWidth = 1.75,
  className,
  children,
  ...rest
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SharePointIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="7.5" r="4" />
      <circle cx="16.5" cy="11" r="3" />
      <circle cx="12" cy="16" r="2.5" />
      <rect x="3" y="13" width="6" height="6" rx="1.25" />
      <path d="M5 15.5h2M5 17h2" />
    </Base>
  );
}

export function TeamsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="5.5" r="2.25" />
      <circle cx="15.5" cy="6.5" r="2" />
      <path d="M4 21v-4.5a3.5 3.5 0 0 1 3.5-3.5h3a3.5 3.5 0 0 1 3.5 3.5V21" />
      <path d="M14 21v-3a3 3 0 0 1 3-3h1a3 3 0 0 1 3 3v3" />
      <rect x="3" y="11.5" width="7" height="7" rx="1.25" />
      <path d="M4.75 13.5h3.5M6.5 13.5v4.5" />
    </Base>
  );
}

export function OneDriveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 17.5a3.5 3.5 0 0 1-.5-6.95 5 5 0 0 1 9.68-1.4 4 4 0 0 1 5.88 4.26A3.5 3.5 0 0 1 18.5 20H5.5" />
      <path d="M6 14.5c1.2-1.2 2.5-1.2 3.7 0s2.5 1.2 3.7 0 2.5-1.2 3.7 0" />
    </Base>
  );
}

export function OutlookIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M10 6h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H10" />
      <path d="M10 8.5 15.5 12 21 8.5" />
      <rect x="3" y="7" width="8" height="10" rx="1.25" />
      <path d="M7 10.25a1.75 2 0 1 0 0 3.5 1.75 2 0 1 0 0-3.5Z" />
    </Base>
  );
}

export function CopilotIcon(props: IconProps) {
  return (
    <Base {...props} strokeWidth={1.6}>
      <path d="M4 10c0-2.8 2-4.5 4.5-4.5 1.8 0 3 .9 3.8 2.6l.7 1.6c.7 1.6 1.9 2.6 3.8 2.6 2.3 0 4.2 1.7 4.2 4.2 0 2.5-1.9 4-4.2 4-1.8 0-3-.9-3.8-2.6l-.7-1.6c-.7-1.6-1.9-2.6-3.8-2.6C6 13.7 4 12.7 4 10Z" />
      <path d="M8.5 10.5c1.2 0 2 .7 2.6 1.9M15.5 13.5c-1.2 0-2-.7-2.6-1.9" />
    </Base>
  );
}
