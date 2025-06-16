"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface RadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ value, onValueChange, className, children }) => {
  // Wrap children and inject common name
  const name = React.useId()
  const items = React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child
    const c: any = child
    return React.cloneElement(c, {
      name,
      checked: value === c.props.value,
      onChange: () => onValueChange(c.props.value)
    })
  })
  return <div className={cn("space-y-2", className)}>{items}</div>
}

interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  value: string
}

export const RadioGroupItem: React.FC<RadioGroupItemProps> = ({ label, value, className, ...props }) => {
  return (
    <label className="flex items-center space-x-2 cursor-pointer">
      <input
        type="radio"
        value={value}
        className={cn(
          "h-4 w-4 rounded-full border-gray-300 text-primary focus:ring-2 focus:ring-offset-1 focus:ring-primary",
          className
        )}
        {...props}
      />
      <span className="text-sm">{label}</span>
    </label>
  )
} 