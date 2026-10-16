// Small inline icons (decorative: always aria-hidden). 20px grid, 1.75 stroke.

type IconProps = { className?: string };

function Svg({ className = "size-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="11" y="3" width="6" height="4" rx="1" />
    <rect x="11" y="9" width="6" height="8" rx="1" />
    <rect x="3" y="11" width="6" height="6" rx="1" />
  </Svg>
);
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 5h10M7 10h10M7 15h10M3.5 5h.01M3.5 10h.01M3.5 15h.01" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.5 13.5 3.5 3.5" />
  </Svg>
);
export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 17s5.5-4.6 5.5-9A5.5 5.5 0 0 0 4.5 8c0 4.4 5.5 9 5.5 9Z" />
    <circle cx="10" cy="8" r="2" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 5h14M3 10h14M3 15h14" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 8 4.5 4.5L14.5 8" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 5.5 4.5 4.5L8 14.5" />
  </Svg>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" />
  </Svg>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 5v10M5.5 10.5 10 15l4.5-4.5" />
  </Svg>
);
export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h2.5l1.2 3.4-1.7 1.1a9 9 0 0 0 5.5 5.5l1.1-1.7L17 12.5V15a2 2 0 0 1-2 2A12 12 0 0 1 3 5a2 2 0 0 1 2-2Z" />
  </Svg>
);
export const ErrorIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6.5v4M10 13.5h.01" />
  </Svg>
);
export const WarningIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5 17 16H3L10 3.5Z" />
    <path d="M10 8.5v3M10 14h.01" />
  </Svg>
);
export const NoticeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9v4.5M10 6.5h.01" />
  </Svg>
);
export const ColumnsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="14" height="12" rx="1.5" />
    <path d="M8 4v12M12.5 4v12" />
  </Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5v9M6 8.5l4 4 4-4M4 15.5h12" />
  </Svg>
);
export const SignOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
  </Svg>
);
