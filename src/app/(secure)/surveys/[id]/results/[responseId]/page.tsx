/* eslint-disable react/no-unescaped-entities */
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Loader2, ArrowLeft, Brain, Mail, MapPin, Briefcase, GraduationCap, Copy, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SurveyResponseDetail {
  id: number
  submitted_at: string
  demographics: { [key:string]:any }
  answers: Array<{ questionId:number; questionText:string; value:string|string[] }>
  agentToken: string
}

interface SurveyDetailApi {
  survey:{ id:number; title:string; description:string }
  responses: SurveyResponseDetail[]
}

const ResponderDetailPage = () => {
  const params = useParams() as { id:string; responseId:string }
  const surveyId = params.id
  const responseId = parseInt(params.responseId)

  const [data,setData] = useState<SurveyResponseDetail|null>(null)
  const [surveyTitle,setSurveyTitle]=useState<string>('')
  const [loading,setLoading] = useState(true)
  const [copied,setCopied] = useState(false)

  useEffect(()=>{
    const fetchData = async () => {
      try{
        const res = await fetch(`/api/surveys/${surveyId}/analytics`,{
          headers:{ 'Authorization':`Bearer ${localStorage.getItem('token')}` }
        })
        if(res.ok){
          const json:SurveyDetailApi = await res.json()
          setSurveyTitle(json.survey.title)
          const found = json.responses.find(r=>r.id===responseId)
          if(found) setData(found)
        }
      }catch(e){console.error(e)}
      finally{setLoading(false)}
    }
    if(!isNaN(responseId)) fetchData()
  },[surveyId,responseId])

  const copyToken = () => {
    if(!data) return
    navigator.clipboard.writeText(data.agentToken)
    setCopied(true)
    setTimeout(()=>setCopied(false),2000)
  }

  const formatDate = (d:string) => new Date(d).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})

  if(loading){
    return <div className="flex-1 p-2 w-full bg-background"><div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg"><div className="p-6 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-4"/><p className="text-muted-foreground">Loading responder...</p></div></div></div>
  }
  if(!data){
    return <div className="flex-1 p-2 w-full bg-background"><div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg"><div className="p-6 text-center"><p className="text-muted-foreground">Responder not found</p></div></div></div>
  }

  const demo = data.demographics

  return (
    <div className="flex-1 p-2 w-full bg-background">
      <div className="mx-auto rounded-lg bg-card text-card-foreground shadow-lg">
        {/* header */}
        <div className="px-6 py-4 flex items-center">
          <SidebarTrigger className="-ml-0.5 h-5 w-5 text-muted-foreground hover:text-foreground"/>
          <div className="h-4 border-l border-border mx-4"/>
          <Link href={`/surveys/${surveyId}/results`} className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/></Link>
          <div className="h-4 border-l border-border mx-4"/>
          <h1 className="text-base font-medium">{surveyTitle ? `${surveyTitle} – Responder Details` : 'Responder Details'}</h1>
        </div>
        <div className="border-b border-border"/>

        <div className="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5"/>Digital Twin</CardTitle>
              <CardDescription>Interact with this respondent's digital twin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground"/><span className="truncate">{demo.email}</span></div>
                <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground"/><span>{demo.location}</span></div>
                <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground"/><span>{demo.occupation}</span></div>
                <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-muted-foreground"/><span>{demo.education}</span></div>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Agent Token</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs font-mono flex-1 truncate">{data.agentToken}</code>
                  <Button size="sm" variant="outline" onClick={copyToken}>{copied ? <CheckCircle className="h-3 w-3"/> : <Copy className="h-3 w-3"/>}</Button>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Submitted: {formatDate(data.submitted_at)}</p>
              </div>
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Survey Answers</h4>
                <div className="space-y-4">
                  {data.answers.map(ans => (
                    <div key={ans.questionId}>
                      <p className="font-medium text-muted-foreground">{ans.questionText}</p>
                      <p>{Array.isArray(ans.value) ? ans.value.join(', ') : ans.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ResponderDetailPage 