'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { FileText, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Question {
  id: string
  question_text: string
  question_type: string
  response_options: string[]
  is_demographic: boolean
}

interface ViewQuestionsDialogProps {
  surveyId: string
}

export function ViewQuestionsDialog({ surveyId }: ViewQuestionsDialogProps) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/surveys/${surveyId}/questions`)
      if (!response.ok) {
        throw new Error('Failed to fetch questions')
      }
      const data = await response.json()
      // The API returns questions and demographics separately, combine them
      const allQuestions = [
        ...(data.demographics || []),
        ...(data.questions || [])
      ]
      if (allQuestions.length > 0) {
        setQuestions(allQuestions)
      } else {
        setError('No questions found')
      }
    } catch (err) {
      console.error('Error fetching questions:', err)
      setError(err instanceof Error ? err.message : 'Failed to load questions')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen && questions.length === 0) {
      fetchQuestions()
    }
  }

  const getQuestionTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'multiple_choice': 'Multiple Choice',
      'text': 'Text',
      'scale': 'Scale',
      'yes_no': 'Yes/No',
      'demographic': 'Demographic',
      'single_choice': 'Single Choice',
      'checkbox': 'Checkbox'
    }
    return typeMap[type] || type
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FileText className="h-3 w-3 mr-1.5" />
          View Questions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Survey Questions</DialogTitle>
          <DialogDescription>
            All questions in this survey
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{error}</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No questions found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((question, index) => (
                <Card key={question.id}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-muted-foreground">
                              Q{index + 1}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {getQuestionTypeLabel(question.question_type)}
                            </Badge>
                            {question.is_demographic && (
                              <Badge variant="outline" className="text-xs">
                                Demographic
                              </Badge>
                            )}
                            {false && (
                              <Badge variant="destructive" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium text-foreground">
                            {question.question_text}
                          </p>
                        </div>
                      </div>
                      
                      {question.response_options && question.response_options.length > 0 && (
                        <div className="mt-3 pl-4 border-l-2 border-muted">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Options:
                          </p>
                          <ul className="space-y-1">
                            {question.response_options.map((option, optIndex) => (
                              <li key={optIndex} className="text-sm text-muted-foreground">
                                • {option}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
