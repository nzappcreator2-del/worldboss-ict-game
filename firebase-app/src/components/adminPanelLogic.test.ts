import { describe, expect, it } from 'vitest'
import { reportSummary, reportsToCsv } from './adminPanelLogic'

describe('admin report helpers', () => {
  it('summarizes an empty report and a populated report', () => {
    expect(reportSummary([])).toEqual({ count: 0, average: 0, highest: 0 })
    expect(reportSummary([{ score: 4 }, { score: 8 }, { score: 3 }])).toEqual({ count: 3, average: 5, highest: 8 })
  })

  it('exports UTF-8 CSV, quotes commas, and neutralizes spreadsheet formulas', () => {
    const csv = reportsToCsv([{ timestamp: '29/6/2569', name: '=HYPERLINK("bad")', class: 'ป.5,ห้อง 1', totalQuestions: 10, score: 8, status: 'Passed' }])

    expect(csv.startsWith('\uFEFFวันที่,ชื่อ,ชั้นเรียน,จำนวนข้อ,คะแนน,สถานะ')).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"')
    expect(csv).toContain('"ป.5,ห้อง 1"')
  })
})
