/**
 * PDF Timetable Extraction Pipeline
 * 
 * Pipeline: PDF → pdfjs-dist text extraction → Grid detection → Cell mapping → 
 *           AI interpretation → Validation → Structured output
 * 
 * Handles: merged cells, irregular spacing, multiple sub-rows, 
 *          different PDF formats (aSc Timetables, etc.)
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TextItem {
    text: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
}

export interface TimetableEntry {
    day: string;
    start_time: string;
    end_time: string;
    subject: string;
    teacher: string;
    room: string;
    block: string;
    class_name: string;
}

export interface ExtractionResult {
    entries: TimetableEntry[];
    errors: string[];
    rawCellCount: number;
    finalEntryCount: number;
}

interface GridCell {
    day: string;
    periodIndex: number;
    texts: TextItem[];
}

interface ColumnBoundary {
    left: number;
    right: number;
    periodIndex: number;
    startTime: string;
    endTime: string;
}

interface RowBoundary {
    top: number;
    bottom: number;
    day: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_PATTERNS = VALID_DAYS.map(d => d.toLowerCase());

// Common time slot definitions (auto-detected from header, these are fallbacks)
const DEFAULT_TIME_SLOTS = [
    { start: '08:10', end: '09:00' },
    { start: '09:00', end: '09:50' },
    { start: '09:50', end: '10:40' },
    { start: '10:40', end: '11:30' },
    { start: '11:30', end: '12:20' },
    { start: '12:20', end: '13:10' },
    { start: '13:10', end: '14:00' },
    { start: '14:00', end: '14:50' },
    { start: '14:50', end: '15:40' },
    { start: '15:40', end: '16:30' },
    { start: '16:30', end: '17:20' },
];

// ── Step 1: Extract text items with positions ──────────────────────────────────

export async function extractTextItems(file: File): Promise<TextItem[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allItems: TextItem[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();

        for (const item of textContent.items) {
            const ti = item as any;
            if (!ti.str || !ti.str.trim()) continue;

            allItems.push({
                text: ti.str.trim(),
                x: Math.round(ti.transform[4] * 10) / 10,
                y: Math.round(ti.transform[5] * 10) / 10,
                width: Math.round((ti.width || 0) * 10) / 10,
                fontSize: Math.round(Math.abs(ti.transform[0]) * 10) / 10,
            });
        }
    }

    return allItems;
}

// ── Step 2: Detect grid structure ──────────────────────────────────────────────

function findDayRows(items: TextItem[]): RowBoundary[] {
    const dayItems: { day: string; y: number; x: number }[] = [];

    for (const item of items) {
        const idx = DAY_PATTERNS.indexOf(item.text.toLowerCase());
        if (idx !== -1) {
            dayItems.push({ day: VALID_DAYS[idx], y: item.y, x: item.x });
        }
    }

    if (dayItems.length === 0) return [];

    // Sort by Y descending (top of page = higher Y in PDF coords)
    dayItems.sort((a, b) => b.y - a.y);

    // Deduplicate days that appear at similar Y positions
    const uniqueDays: typeof dayItems = [];
    for (const d of dayItems) {
        if (!uniqueDays.some(u => u.day === d.day && Math.abs(u.y - d.y) < 10)) {
            uniqueDays.push(d);
        }
    }

    // Build row boundaries
    const rows: RowBoundary[] = [];
    for (let i = 0; i < uniqueDays.length; i++) {
        const topPadding = 35; // extend above the day label
        const top = uniqueDays[i].y + topPadding;
        const bottom = i < uniqueDays.length - 1
            ? uniqueDays[i + 1].y + topPadding
            : -9999;
        rows.push({ top, bottom, day: uniqueDays[i].day });
    }

    return rows;
}

function findColumnBoundaries(items: TextItem[], dayRows: RowBoundary[]): ColumnBoundary[] {
    // Find the topmost Y (page header area)
    const maxY = Math.max(...items.map(i => i.y));

    // The header is above the first day row
    const headerBottomY = dayRows.length > 0 ? dayRows[0].top : maxY - 100;
    const headerItems = items.filter(i => i.y > headerBottomY);

    // Find period number headers like "1.", "2.", "3.", etc.
    const periodHeaders = headerItems
        .filter(i => /^\d{1,2}\.$/.test(i.text))
        .sort((a, b) => a.x - b.x);

    // Always use the known time slots — period numbers directly map to them
    // Period "1." → slot 0 (08:10-09:00), "2." → slot 1 (09:00-09:50), etc.
    const timeSlots = DEFAULT_TIME_SLOTS;

    // Determine column X positions
    let columnXPositions: number[] = [];

    if (periodHeaders.length >= 3) {
        // Use period header positions — map each by its number
        // Period "1." maps to timeSlots[0], "2." to timeSlots[1], etc.
        const periodMap: { x: number; index: number }[] = [];
        for (const h of periodHeaders) {
            const num = parseInt(h.text);
            if (num >= 1 && num <= timeSlots.length) {
                periodMap.push({ x: h.x, index: num - 1 });
            }
        }

        // Build columns from period map
        const columns: ColumnBoundary[] = [];
        for (let i = 0; i < periodMap.length; i++) {
            const pm = periodMap[i];
            const left = pm.x - 8;
            const right = i < periodMap.length - 1 ? periodMap[i + 1].x - 8 : 9999;
            columns.push({
                left,
                right,
                periodIndex: pm.index,
                startTime: timeSlots[pm.index].start,
                endTime: timeSlots[pm.index].end,
            });
        }
        return columns;
    }

    // Fallback: use time strings from header
    const timeStringItems = headerItems
        .filter(i => /\d{1,2}:\d{2}/.test(i.text))
        .sort((a, b) => a.x - b.x);

    const uniqueTimeX: number[] = [];
    for (const t of timeStringItems) {
        if (!uniqueTimeX.some(x => Math.abs(x - t.x) < 25)) {
            uniqueTimeX.push(t.x);
        }
    }
    columnXPositions = uniqueTimeX;

    if (columnXPositions.length < 2) {
        // Last resort: divide page width evenly
        const minX = Math.min(...items.map(i => i.x));
        const maxXPos = Math.max(...items.map(i => i.x));
        const dayColWidth = 80;
        const dataStart = minX + dayColWidth;
        const dataWidth = maxXPos - dataStart;
        const numCols = timeSlots.length;

        for (let i = 0; i < numCols; i++) {
            columnXPositions.push(dataStart + (dataWidth / numCols) * i);
        }
    }

    // Build column boundaries
    const columns: ColumnBoundary[] = [];
    for (let i = 0; i < columnXPositions.length && i < timeSlots.length; i++) {
        const left = columnXPositions[i] - 8;
        const right = i < columnXPositions.length - 1
            ? columnXPositions[i + 1] - 8
            : 9999;
        columns.push({
            left,
            right,
            periodIndex: i,
            startTime: timeSlots[i].start,
            endTime: timeSlots[i].end,
        });
    }

    return columns;
}

// ── Step 3: Map text items to grid cells ───────────────────────────────────────

function mapItemsToCells(
    items: TextItem[],
    rows: RowBoundary[],
    columns: ColumnBoundary[]
): GridCell[] {
    const cellMap = new Map<string, GridCell>();

    // Find the X position of day labels (anything to the left of this is not data)
    const dayLabelMaxX = Math.max(
        ...items
            .filter(i => DAY_PATTERNS.includes(i.text.toLowerCase()))
            .map(i => i.x + (i.width || 50)),
        0
    );

    // Find header Y boundary
    const headerY = rows.length > 0 ? rows[0].top : 9999;

    for (const item of items) {
        // Skip header items
        if (item.y > headerY) continue;

        // Skip day labels themselves
        if (DAY_PATTERNS.includes(item.text.toLowerCase())) continue;

        // Skip items in the day label column
        if (item.x < dayLabelMaxX - 10) continue;

        // Skip noise text
        if (isNoiseText(item.text)) continue;

        // Find matching row (day) and column (period)
        const row = rows.find(r => item.y <= r.top && item.y > r.bottom);
        const col = columns.find(c => item.x >= c.left && item.x < c.right);

        if (row && col) {
            const key = `${row.day}|${col.periodIndex}`;
            if (!cellMap.has(key)) {
                cellMap.set(key, {
                    day: row.day,
                    periodIndex: col.periodIndex,
                    texts: [],
                });
            }
            cellMap.get(key)!.texts.push(item);
        }
    }

    return Array.from(cellMap.values());
}

function isNoiseText(text: string): boolean {
    // Skip single characters, purely numeric
    if (text.length <= 1) return true;
    // Skip page markers, generators, headers/footers
    if (/^(timetable generated|asc timetables|page \d)/i.test(text)) return true;
    if (/^(manav rachna|university|sector|faridabad|declared|great place)/i.test(text)) return true;
    // Skip period number references
    if (/^\d{1,2}\.$/.test(text)) return true;
    // Skip bare time strings
    if (/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(text)) return true;
    if (/^\d{1,2}:\d{2}$/.test(text)) return true;
    return false;
}

function parseCellToEntries(cell: GridCell, columns: ColumnBoundary[]): TimetableEntry[] {
    const col = columns.find(c => c.periodIndex === cell.periodIndex);
    if (!col) return [];
    if (cell.texts.length === 0) return [];

    // Sort texts by Y descending (top to bottom)
    const sortedTexts = [...cell.texts].sort((a, b) => b.y - a.y || a.x - b.x);

    // Group text items into sub-rows by Y proximity
    // Each "sub-group" separated by a larger Y gap likely represents a separate class
    const subGroups: TextItem[][] = [];
    let currentGroup: TextItem[] = [sortedTexts[0]];

    for (let i = 1; i < sortedTexts.length; i++) {
        const gap = Math.abs(sortedTexts[i - 1].y - sortedTexts[i].y);
        // If there's a significant gap AND we already have a subject-like text in current group,
        // this might be a new class entry
        if (gap > 12 && currentGroup.length >= 2) {
            subGroups.push(currentGroup);
            currentGroup = [sortedTexts[i]];
        } else {
            currentGroup.push(sortedTexts[i]);
        }
    }
    subGroups.push(currentGroup);

    // Parse each sub-group into an entry
    const entries: TimetableEntry[] = [];
    for (const group of subGroups) {
        const entry = classifyTextsToEntry(group.map(t => t.text), cell.day, col);
        if (entry) entries.push(entry);
    }

    // If only one group found, try the original flat classification as fallback
    if (entries.length === 0) {
        const entry = classifyTextsToEntry(sortedTexts.map(t => t.text), cell.day, col);
        if (entry) entries.push(entry);
    }

    return entries;
}

// Classify an array of text strings into a single TimetableEntry
function classifyTextsToEntry(
    textStrings: string[],
    day: string,
    col: ColumnBoundary
): TimetableEntry | null {
    let subject = '';
    let teacher = '';
    let room = '';
    let block = '';
    let className = '';

    for (const text of textStrings) {
        // Teacher patterns: NAME_NAME, all-caps with underscore
        if (/^[A-Z]{2,}_[A-Za-z]+/.test(text) || /^(SOE|CDC|HCL|VAC)_/i.test(text)) {
            teacher = teacher ? `${teacher}, ${text}` : text;
        }
        // Room/lab patterns: HF09, LAB02, HS-08, NG03, LF03, etc.
        else if (/^[A-Z]{1,4}[-]?\d{1,3}$/i.test(text) && text.length <= 8) {
            room = room ? room : text;
        }
        // Lab patterns
        else if (/lab/i.test(text) && text.length <= 10 && /\d/.test(text)) {
            room = room ? room : text;
        }
        // Class section patterns: CSE 6A, Group 1, G1, G2
        else if (/^(CSE|ECE|ME|CE|EE|IT|BT)\s*\d/i.test(text)) {
            className = className ? className : text;
        }
        else if (/^group\s*\d/i.test(text)) {
            className = className ? className : text;
        }
        else if (/^G\d$/i.test(text)) {
            block = text;
        }
        // Block patterns
        else if (/^(Block|Blk)\s*[A-Z]/i.test(text)) {
            block = text;
        }
        // Subject (anything else meaningful)
        else if (text.length > 1) {
            if (!subject) {
                subject = text;
            } else {
                if (/^[A-Z]{2,3}\s+\d/.test(text)) {
                    className = className ? className : text;
                } else if (!className && text.length < 10) {
                    className = text;
                } else {
                    subject = `${subject} ${text}`;
                }
            }
        }
    }

    if (!subject) return null;

    return {
        day,
        start_time: col.startTime,
        end_time: col.endTime,
        subject: subject.trim(),
        teacher: teacher.trim(),
        room: room.trim(),
        block: block.trim(),
        class_name: className.trim(),
    };
}

// ── Step 5: AI Refinement (for ambiguous cases) ────────────────────────────────

async function refineWithAI(
    entries: TimetableEntry[],
    rawText: string,
    apiKey: string
): Promise<TimetableEntry[]> {
    if (!apiKey) return entries;

    // Build a summary of what we extracted for the AI to verify/fix
    const entrySummary = entries.map((e, i) =>
        `${i + 1}. ${e.day} ${e.start_time}-${e.end_time}: ${e.subject} | room:${e.room} | class:${e.class_name} | teacher:${e.teacher}`
    ).join('\n');

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-001',
                max_tokens: 8192,
                messages: [
                    {
                        role: 'system',
                        content: `You are a timetable data validator. You receive:
1. Raw text extracted from a PDF timetable
2. A preliminary parsed list of timetable entries with CORRECT time slots

Your job is to ONLY:
- Fix incorrect subject/room/teacher/class_name field assignments
- Add any MISSING entries that appear in the raw text but were missed
- Remove duplicate entries
- Ensure class_name contains the section (like "CSE 6A")
- Teacher codes: SOE_ASK, CDC_PRIYA, HCL_Sonia, etc.
- Room codes: HF09, LAB02, HS-08, NG-04, LF03, etc.

DO NOT CHANGE start_time or end_time values — they are already correct from grid detection.
The time periods are:
1: 08:10-09:00, 2: 09:00-09:50, 3: 09:50-10:40, 4: 10:40-11:30,
5: 11:30-12:20, 6: 12:20-13:10, 7: 13:10-14:00, 8: 14:00-14:50,
9: 14:50-15:40, 10: 15:40-16:30, 11: 16:30-17:20

If a cell has MULTIPLE classes (sub-rows), create separate entries with the SAME time slot.

Return ONLY a JSON array. Each: {"day","start_time","end_time","subject","teacher","room","block","class_name"}
No markdown, no explanation.`
                    },
                    {
                        role: 'user',
                        content: `RAW TEXT FROM PDF:\n${rawText}\n\n---\n\nPRELIMINARY PARSED ENTRIES (${entries.length} found):\n${entrySummary}\n\nVerify, fix field assignments, and add missing entries. DO NOT change any start_time or end_time. Return COMPLETE JSON array.`
                    }
                ],
            })
        });

        if (!response.ok) return entries; // Fall back to grid-parsed entries

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const mapEntry = (e: any): TimetableEntry => {
            const entry: TimetableEntry = {
                day: e.day || '',
                start_time: e.start_time || '',
                end_time: e.end_time || '',
                subject: e.subject || '',
                teacher: e.teacher || '',
                room: e.room || '',
                block: e.block || '',
                class_name: e.class_name || '',
            };
            // Snap times to valid slots to prevent AI from changing them
            return snapToValidTimeSlot(entry);
        };

        try {
            const parsed = JSON.parse(cleaned);
            const result = Array.isArray(parsed) ? parsed : (parsed.timetable || parsed.data || []);

            // Validate AI response has reasonable entries
            if (result.length >= entries.length * 0.5) {
                return result.map(mapEntry);
            }
        } catch {
            // Try extracting JSON array from response
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    const arr = JSON.parse(match[0]);
                    if (arr.length >= entries.length * 0.5) {
                        return arr.map(mapEntry);
                    }
                } catch { /* fall through */ }
            }
        }
    } catch {
        // AI failed, use grid-parsed entries
    }

    return entries;
}

// ── Step 6: Validation & Deduplication ─────────────────────────────────────────

function validateAndDeduplicate(entries: TimetableEntry[]): { valid: TimetableEntry[]; errors: string[] } {
    const errors: string[] = [];
    const valid: TimetableEntry[] = [];

    // Group entries by day and time slot
    const groups = new Map<string, TimetableEntry[]>();

    for (const entry of entries) {
        // Validate day
        if (!VALID_DAYS.includes(entry.day)) {
            const match = VALID_DAYS.find(d => d.toLowerCase().startsWith(entry.day.toLowerCase().slice(0, 3)));
            if (match) {
                entry.day = match;
            } else {
                errors.push(`Invalid day "${entry.day}" for subject "${entry.subject}"`);
                continue;
            }
        }

        // Validate time format
        entry.start_time = normalizeTime(entry.start_time);
        entry.end_time = normalizeTime(entry.end_time);

        if (!entry.start_time || !entry.end_time) {
            errors.push(`Invalid time for ${entry.day} ${entry.subject}`);
            continue;
        }

        // Must have a subject
        if (!entry.subject || entry.subject.length < 2) {
            continue;
        }

        const slotKey = `${entry.day}|${entry.start_time}|${entry.end_time}`;
        if (!groups.has(slotKey)) {
            groups.set(slotKey, []);
        }
        groups.get(slotKey)!.push(entry);
    }

    // Merge entries in each group
    for (const [_, slotEntries] of groups) {
        if (slotEntries.length === 1) {
            valid.push(slotEntries[0]);
            continue;
        }

        // Multiple entries in the same slot - merge them
        const merged: TimetableEntry = {
            day: slotEntries[0].day,
            start_time: slotEntries[0].start_time,
            end_time: slotEntries[0].end_time,
            subject: Array.from(new Set(slotEntries.map(e => e.subject))).join(' / '),
            teacher: Array.from(new Set(slotEntries.flatMap(e => e.teacher.split(',').map(t => t.trim())).filter(Boolean))).join(', '),
            room: Array.from(new Set(slotEntries.map(e => e.room).filter(Boolean))).join(', '),
            block: Array.from(new Set(slotEntries.map(e => e.block).filter(Boolean))).join(', '),
            class_name: Array.from(new Set(slotEntries.map(e => e.class_name).filter(Boolean))).join(', '),
        };

        valid.push(merged);
    }

    return { valid, errors };
}

function normalizeTime(time: string): string {
    if (!time) return '';
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return '';
    return `${match[1].padStart(2, '0')}:${match[2]}`;
}

// Snap an entry's times to the nearest valid time slot
// This prevents AI from modifying the grid-parsed times
function snapToValidTimeSlot(entry: TimetableEntry): TimetableEntry {
    const normalized = normalizeTime(entry.start_time);
    if (!normalized) return entry;

    // Find exact match first
    const exactSlot = DEFAULT_TIME_SLOTS.find(s => s.start === normalized);
    if (exactSlot) {
        return { ...entry, start_time: exactSlot.start, end_time: exactSlot.end };
    }

    // Find nearest slot by comparing minutes since midnight
    const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const entryMin = toMin(normalized);
    let nearest = DEFAULT_TIME_SLOTS[0];
    let minDiff = Infinity;

    for (const slot of DEFAULT_TIME_SLOTS) {
        const diff = Math.abs(toMin(slot.start) - entryMin);
        if (diff < minDiff) {
            minDiff = diff;
            nearest = slot;
        }
    }

    return { ...entry, start_time: nearest.start, end_time: nearest.end };
}

// ── Step 7: Generate raw text for AI context ───────────────────────────────────

function generateRawText(items: TextItem[]): string {
    // Sort by Y descending, X ascending
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    let currentY = -1;
    let currentRow: string[] = [];
    const rows: string[] = [];

    for (const item of sorted) {
        if (currentY === -1 || Math.abs(item.y - currentY) > 3) {
            if (currentRow.length > 0) {
                rows.push(currentRow.join(' | '));
            }
            currentRow = [`[x:${Math.round(item.x)}]${item.text}`];
            currentY = item.y;
        } else {
            currentRow.push(`[x:${Math.round(item.x)}]${item.text}`);
        }
    }
    if (currentRow.length > 0) {
        rows.push(currentRow.join(' | '));
    }

    return rows.join('\n');
}

// ── Main Pipeline ──────────────────────────────────────────────────────────────

export async function extractTimetableFromPDF(
    file: File,
    openRouterApiKey: string = ''
): Promise<ExtractionResult> {
    const errors: string[] = [];

    // Step 1: Extract text items
    const items = await extractTextItems(file);
    if (items.length === 0) {
        throw new Error('No text found in PDF. The file may be image-based (scanned). Please use a digital PDF.');
    }

    console.log(`[PDF Extractor] Extracted ${items.length} text items`);

    // Step 2: Detect grid structure
    const dayRows = findDayRows(items);
    if (dayRows.length === 0) {
        throw new Error('Could not find day labels (Monday, Tuesday, etc.) in the PDF. Please ensure the timetable has day headers.');
    }
    console.log(`[PDF Extractor] Found ${dayRows.length} day rows: ${dayRows.map(r => r.day).join(', ')}`);

    const columns = findColumnBoundaries(items, dayRows);
    console.log(`[PDF Extractor] Found ${columns.length} time columns`);

    // Step 3: Map items to cells
    const cells = mapItemsToCells(items, dayRows, columns);
    console.log(`[PDF Extractor] Mapped ${cells.length} cells`);

    // Step 4: Parse cells into entries
    let entries = cells
        .flatMap(cell => parseCellToEntries(cell, columns));
    console.log(`[PDF Extractor] Parsed ${entries.length} entries from grid`);

    // Step 5: AI refinement
    if (openRouterApiKey) {
        const rawText = generateRawText(items);
        entries = await refineWithAI(entries, rawText, openRouterApiKey);
        console.log(`[PDF Extractor] After AI refinement: ${entries.length} entries`);
    }

    // Step 6: Validate and deduplicate
    const { valid, errors: validationErrors } = validateAndDeduplicate(entries);
    errors.push(...validationErrors);

    console.log(`[PDF Extractor] Final: ${valid.length} valid entries, ${errors.length} errors`);

    return {
        entries: valid,
        errors,
        rawCellCount: cells.length,
        finalEntryCount: valid.length,
    };
}
