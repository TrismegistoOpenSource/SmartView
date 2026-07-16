import type { ReactElement, SVGProps } from 'react'

function Svg(props: SVGProps<SVGSVGElement> & { children: ReactElement | ReactElement[] }) {
  const { children, ...rest } = props
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconFolderOpen = () => (
  <Svg>
    <path d="M6 14l1.5-5A2 2 0 0 1 9.4 7.5h11.1a1 1 0 0 1 .96 1.27L20 14.5a2 2 0 0 1-1.92 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 2.5h7" />
  </Svg>
)

export const IconSave = () => (
  <Svg>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </Svg>
)

export const IconUndo = () => (
  <Svg>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Svg>
)

export const IconText = () => (
  <Svg>
    <path d="M5 5h14" />
    <path d="M12 5v14" />
    <path d="M9 19h6" />
  </Svg>
)

export const IconRedo = () => (
  <Svg>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Svg>
)

export const IconMerge = () => (
  <Svg>
    <rect x="3" y="4" width="10" height="13" rx="1.6" />
    <path d="M17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-2" />
    <path d="M8 8.5v4M6 10.5h4" />
  </Svg>
)

export const IconExtract = () => (
  <Svg>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
    <path d="M14 3v5h5" />
    <path d="M15 15h6M15 15l2.5-2.5M15 15l2.5 2.5" />
  </Svg>
)

export const IconRotate = () => (
  <Svg>
    <path d="M21 8a9 9 0 1 0 .5 4" />
    <path d="M21 3v5h-5" />
  </Svg>
)

export const IconTrash = () => (
  <Svg>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </Svg>
)

export const IconSidebar = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9.5 4v16" />
  </Svg>
)

export const IconZoomIn = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.5-4.5" />
    <path d="M8 11h6M11 8v6" />
  </Svg>
)

export const IconZoomOut = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.5-4.5" />
    <path d="M8 11h6" />
  </Svg>
)

export const IconZoomActual = () => (
  <Svg>
    <circle cx="10" cy="10" r="7" />
    <path d="M20 20l-4.5-4.5" />
    <text
      x="10"
      y="13.6"
      textAnchor="middle"
      fontSize="9.5"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
    >
      1
    </text>
  </Svg>
)

export const IconZoomFit = () => (
  <Svg>
    <path d="M4 9V5a1 1 0 0 1 1-1h4" />
    <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
    <path d="M4 15v4a1 1 0 0 0 1 1h4" />
    <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
  </Svg>
)

export const IconPlus = () => (
  <Svg width="15" height="15">
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconClose = () => (
  <Svg width="13" height="13" strokeWidth="2">
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const IconDocument = () => (
  <Svg width="44" height="44" strokeWidth="1.2">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Svg>
)

export const IconSignature = () => (
  <Svg width="17" height="17">
    <path d="M3 17c3 0 4-11 6-11s1 7 3 7 2-4 4-4" />
    <path d="M3 20h14" />
  </Svg>
)

export const IconArchive = () => (
  <Svg width="17" height="17">
    <rect x="3" y="4" width="14" height="4" rx="1" />
    <path d="M5 8v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" />
    <path d="M8 12h4" />
  </Svg>
)

export const IconImage = () => (
  <Svg width="28" height="28" strokeWidth="1.4">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5L5 20" />
  </Svg>
)

export const IconFilePdf = () => (
  <Svg width="28" height="28" strokeWidth="1.4">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Svg>
)
