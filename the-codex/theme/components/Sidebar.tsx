import { ChevronRight, FileText, Folder } from 'lucide-react'

type SidebarTitleProps = {
  title: string
  type: string
  route: string
}

/** Sidebar item title rendered for each navigation entry.
 *  Used as DocsThemeConfig.sidebar.titleComponent so Nextra controls the
 *  tree structure while we supply the per-item visual treatment.
 */
export function SidebarTitle({ title, type }: SidebarTitleProps) {
  const Icon =
    type === 'separator'
      ? null
      : type === 'folder' || type === 'menu'
        ? Folder
        : FileText

  return (
    <span className="flex items-center gap-2 text-roman-obsidian dark:text-roman-parchment group-hover:text-roman-terracotta">
      {Icon && (
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-roman-stone group-hover:text-roman-terracotta transition-colors" />
      )}
      <span className="truncate">{title}</span>
      {(type === 'folder' || type === 'menu') && (
        <ChevronRight className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-roman-stone transition-transform group-data-[open=true]:rotate-90" />
      )}
    </span>
  )
}
