"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Context for managing radio group state
interface RadioGroupContextType {
  value: string
  onValueChange: (value: string) => void
  name: string
}

const RadioGroupContext = React.createContext<RadioGroupContextType | null>(null)

const useRadioGroup = () => {
  const context = React.useContext(RadioGroupContext)
  if (!context) {
    throw new Error("RadioGroupItem must be used within a RadioGroup")
  }
  return context
}

interface RadioGroupProps {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
  name?: string
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ 
  value, 
  onValueChange, 
  className, 
  children,
  name: providedName
}) => {
  const generatedName = React.useId()
  const name = providedName || generatedName

  const contextValue = React.useMemo(() => ({
    value,
    onValueChange,
    name
  }), [value, onValueChange, name])

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <div className={cn("space-y-2", className)} role="radiogroup">
        {children}
      </div>
    </RadioGroupContext.Provider>
  )
}

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'name' | 'checked' | 'onChange'> {
  label: string
  value: string
}

export const RadioGroupItem: React.FC<RadioGroupItemProps> = ({ 
  label, 
  value, 
  className, 
  ...props 
}) => {
  const { value: groupValue, onValueChange, name } = useRadioGroup()
  const isChecked = groupValue === value

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onValueChange(value)
    }
  }

  return (
    <label className="flex items-center space-x-2 cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        checked={isChecked}
        onChange={handleChange}
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