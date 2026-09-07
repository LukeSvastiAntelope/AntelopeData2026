'use client'

import { useState } from 'react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Database, ShoppingCart } from 'lucide-react'

type Provider = 'ncsl' | 'state_rolls' | 'fec' | 'census'

export default function FundraisingDataPage() {
  const [provider, setProvider] = useState<Provider>('ncsl')

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        <div className="px-6 py-2">
          <div className="flex items-center">
            <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground" />
            <div className="h-4 border-l border-border mx-4" />
            <h1 className="text-base font-medium text-card-foreground flex items-center gap-2">
              <Database className="h-4 w-4" />
              Get electoral data
            </h1>
          </div>
        </div>
        <div className="border-b border-border" />

        <div className="p-6 max-w-3xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Choose a dataset</CardTitle>
              <CardDescription>
                This is the “marketplace” stub. Next step is wiring provider APIs/contracts, pricing, and import format normalization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ncsl">NCSL (public + legislative reference)</SelectItem>
                    <SelectItem value="state_rolls">State voter rolls (public where allowed)</SelectItem>
                    <SelectItem value="fec">FEC donations (public)</SelectItem>
                    <SelectItem value="census">Census / ACS (public)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium">{provider}</span>
                </div>
              </div>

              <Button disabled className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Continue (coming soon)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

