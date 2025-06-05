import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@owox/ui/components/dropdown-menu"
import { SidebarMenuItem } from "@owox/ui/components/sidebar"
import { ChevronDown, Github, Globe, AlertCircle, Scale, MessageCircle } from "lucide-react"
import { useRef, useState, useLayoutEffect } from "react"
import Logo from "./Logo"

type MenuItem =
  | {
      title: string
      href: string
      icon: React.ComponentType<{ className?: string }>
      type?: never
    }
  | {
      type: "separator"
      title?: never
      href?: never
      icon?: never
    }

const menuItems: MenuItem[] = [
  {
    title: "GitHub Community",
    href: "https://github.com/OWOX/owox-data-marts",
    icon: Github,
  },
  {
    title: "OWOX Website",
    href: "https://www.owox.com/",
    icon: Globe,
  },
  {
    type: "separator",
  },
  {
    title: "Discussions",
    href: "https://github.com/OWOX/owox-data-marts/discussions",
    icon: MessageCircle,
  },
  {
    title: "Issues",
    href: "https://github.com/OWOX/owox-data-marts/issues",
    icon: AlertCircle,
  },
  {
    type: "separator",
  },
  {
    title: "License",
    href: "https://github.com/OWOX/owox-data-marts#License-1-ov-file",
    icon: Scale,
  },
]

export function SidebarHeaderDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const [width, setWidth] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (triggerRef.current) {
      setWidth(triggerRef.current.offsetWidth)
    }
  }, [])

  return (
    <div data-slot="sidebar-header" data-sidebar="header" className="flex flex-col gap-2">
      <ul
        data-slot="sidebar-menu"
        data-sidebar="menu"
        className="flex w-full min-w-0 flex-col gap-1"
      >
        <li
          data-slot="sidebar-menu-item"
          data-sidebar="menu-item"
          className="relative group/menu-item"
        >
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <button
                ref={triggerRef}
                type="button"
                data-slot="dropdown-menu-trigger"
                data-sidebar="menu-button"
                data-size="lg"
                data-active={isOpen ? "true" : "false"}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                data-state={isOpen ? "open" : "closed"}
                className={`peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-hidden ring-sidebar-ring transition-[width,height,padding] focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-12 text-sm group-data-[collapsible=icon]:p-0!`}
              >
                <div className="bg-white dark:bg-white/10 text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center border rounded-md">
                  <Logo width={24} height={24} />
                </div>

                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">OWOX Data Marts</span>
                  <span className="truncate text-xs text-muted-foreground">Community Edition</span>
                </div>

                <ChevronDown
                  className={`ml-auto size-4 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="start"
              sideOffset={8}
              style={{ width: width > 0 ? width : undefined }}
              className="w-[var(--radix-dropdown-trigger-width)]"
            >
              {menuItems.map((item, index) => {
                if (item.type === "separator") {
                  return <DropdownMenuSeparator key={`separator-${index}`} />
                }

                const Icon = item.icon

                return (
                  <DropdownMenuItem key={item.href} asChild>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <Icon className="size-4" />
                      {item.title}
                    </a>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </div>
  )
}
