import { ChevronDown, Github, Globe, AlertCircle, Scale, MessageCircle } from "lucide-react"
import Logo from "./Logo"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@owox/ui/components/dropdown-menu"
import { useState, useRef, useLayoutEffect } from "react"

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
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          className={`w-full flex items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
            isOpen ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
          }`}
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
              <a href={item.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <Icon className="size-4" />
                {item.title}
              </a>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
} 