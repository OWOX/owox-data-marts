import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarGroupLabel,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
  } from "@owox/ui/components/sidebar"
import { Home } from "lucide-react"
import { createElement } from "react"
import { ThemeToggle } from "./theme-toggle"
import Logo from "./Logo"
  
  // Menu items.
const items = [
    {
      title: "Home",
      url: "#",
      icon: Home,
    }, 
  ]

  export function AppSidebar() {
    return (
      <Sidebar>
        <SidebarHeader>
          <Logo />
        </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {/*<SidebarGroupLabel>Application</SidebarGroupLabel>*/}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
                      {createElement(item.icon)}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
    )
  }