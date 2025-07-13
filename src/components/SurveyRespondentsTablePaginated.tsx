"use client"

import * as React from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface SurveyResponse {
  id: number
  submitted_at: string
  demographics: Record<string, any>
  agentToken: string
}

interface ApiResponse {
  total: number
  page: number
  limit: number
  totalPages: number
  responses: SurveyResponse[]
}

interface Props {
  surveyId: string
}

export function SurveyRespondentsTablePaginated({ surveyId }: Props) {
  const [pageIndex, setPageIndex] = React.useState(0) // zero-based
  const [pageSize, setPageSize] = React.useState(10)
  const [sorting, setSorting] = React.useState<SortingState>([])

  const [data, setData] = React.useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const response = await fetch(`/api/surveys/${surveyId}/responses?page=${pageIndex + 1}&limit=${pageSize}`)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        const json: ApiResponse = await response.json()
        setData(json)
      } catch (error) {
        console.error("Failed to fetch survey responses:", error)
        setData(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
    // No automatic polling; user can change page/size to refetch
    // If background refresh is needed, consider SWR/react-query instead.
    return () => {}
  }, [surveyId, pageIndex, pageSize])

  const columns = React.useMemo<ColumnDef<SurveyResponse>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() ? "indeterminate" as any : false)}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'demographics.name',
      id: 'responder',
      header: 'Responder',
      cell: ({ row }) => {
        const d = row.original.demographics
        const label = d?.name || d?.email || `Responder #${row.original.id}`
        return <div className="font-medium">{label}</div>
      }
    },
    {
      accessorKey: 'demographics.age',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Age <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <div>{row.original.demographics?.age || '-'}</div>,
    },
    {
      accessorKey: 'demographics.location',
      header: 'Location',
      cell: ({ row }) => <div>{row.original.demographics?.location || '-'}</div>,
    },
  ], [])

  const table = useReactTable({
    data: data?.responses ?? [],
    columns,
    state: { sorting, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: data ? data.totalPages : -1,
  })

  // Sync table's internal pageIndex with local state
  React.useEffect(() => {
    table.setPageIndex(pageIndex)
  }, [pageIndex])

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id}>
                {hg.headers.map(header => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center">Loading...</TableCell>
              </TableRow>
            ) : data && data.responses.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="rows-per-page">Rows per page</Label>
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(parseInt(v)); setPageIndex(0); }}>
            <SelectTrigger className="w-20" id="rows-per-page">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10,20,30,40,50].map(sz => <SelectItem key={sz} value={String(sz)}>{sz}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={pageIndex===0} onClick={() => setPageIndex(0)}><ChevronsLeft /></Button>
          <Button variant="outline" size="icon" disabled={pageIndex===0} onClick={() => setPageIndex(p => Math.max(p-1,0))}><ChevronLeft/></Button>
          <span>Page {pageIndex+1} of {data?.totalPages ?? '…'}</span>
          <Button variant="outline" size="icon" disabled={!data || pageIndex+1>= (data.totalPages || 0)} onClick={() => setPageIndex(p => p+1)}><ChevronRight/></Button>
          <Button variant="outline" size="icon" disabled={!data || pageIndex+1>= (data.totalPages || 0)} onClick={() => data && setPageIndex(data.totalPages-1)}><ChevronsRight /></Button>
        </div>
      </div>
    </div>
  )
} 