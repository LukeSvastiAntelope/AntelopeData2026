# Marketmaker Application Layout Pattern

## Overview
This document defines the standard layout structure that should be used for all pages in the marketmaker application. When you ask me to "use the standard layout" or "follow the layout pattern," this is what you're referring to.

## Layout Structure

### 1. Overall Container Structure
```jsx
<div className="flex-1 p-2 w-full bg-background">
  <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
    {/* Header Section */}
    {/* Content Section */}
  </div>
</div>
```

### 2. Header Section (Required)
```jsx
{/* Header */}
<div className="px-6 py-4">
  <div className="flex items-center">
    <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
    <div className="h-4 border-l border-border mx-4" />
    <h1 className="text-base font-medium text-card-foreground">[Page Title]</h1>
  </div>
</div>

<div className="border-b border-border" />
```

### 3. Content Section
```jsx
<div className="p-6">
  {/* All page content goes here */}
</div>
```

## Key Components

### Left Sidebar
- **Collapsible**: Uses `SidebarTrigger` component
- **Always Present**: Managed by the layout wrapper
- **Expand/Collapse**: Controlled by the hamburger menu button in the header

### Main Content Area
- **Rounded Corners**: Applied via `rounded-lg` class
- **Card Background**: Uses `bg-card` with `shadow-lg`
- **Padding**: Slight padding around the entire content area (`p-2` on outer container)
- **Responsive**: Full width with proper margins

### Header Bar
- **Sidebar Trigger**: Hamburger menu button (top-left corner)
- **Separator**: Vertical line divider
- **Page Title**: Descriptive title for the current page
- **Border**: Bottom border to separate from content

## Required Imports
```jsx
import { SidebarTrigger } from "@/components/ui/sidebar"
```

## Visual Characteristics

### Spacing & Padding
- **Outer Container**: `p-2` (slight padding around entire card)
- **Header**: `px-6 py-4` (horizontal and vertical padding)
- **Content**: `p-6` (generous padding for content area)

### Colors & Theming
- **Background**: `bg-background` (page background)
- **Card**: `bg-card text-card-foreground` (main content card)
- **Shadow**: `shadow-lg` (elevated card appearance)
- **Borders**: `border-border` (theme-aware border colors)

### Typography
- **Page Title**: `text-base font-medium text-card-foreground`
- **Sidebar Trigger**: `text-muted-foreground hover:text-foreground`

## Example Implementation
See `src/app/(secure)/dashboard/page.tsx` and `src/app/(secure)/create/page.tsx` for reference implementations.

## When to Use This Pattern
- **All secure pages**: Any page within the `(secure)` route group
- **Main content pages**: Dashboard, Markets, Strategy, Admin, etc.
- **Form pages**: Create prediction, settings, profile, etc.
- **List/table pages**: Any page displaying data or collections

## Layout Benefits
1. **Consistent UX**: Users always know where to find navigation controls
2. **Responsive**: Works on all screen sizes
3. **Accessible**: Proper semantic structure and focus management
4. **Theme-Aware**: Automatically adapts to light/dark themes
5. **Expandable**: Content area can accommodate any type of content

## Notes
- The sidebar is managed by the parent layout (`src/app/(secure)/layout.tsx`)
- The `SidebarTrigger` component handles the expand/collapse functionality
- All pages should follow this exact structure for consistency
- Content within the `<div className="p-6">` section can be customized per page 