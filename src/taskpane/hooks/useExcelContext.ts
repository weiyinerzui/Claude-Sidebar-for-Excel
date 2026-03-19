import { useState, useEffect, useCallback } from 'react';

// ─── 多区域选择类型定义 ────────────────────────────────────────────────────────

export interface SelectedRange {
  id: string;           // 唯一ID
  index: number;        // 区域编号(1-based)
  address: string;      // "Sheet1!A1:D10"
  sheetName: string;    // "Sheet1"
  values: any[][] | null;
  formulas: string[][] | null;
  rowCount: number;
  columnCount: number;
  cellCount: number;    // 单元格数
  isPreview: boolean;   // 是否为预览数据
}

export interface ExcelContext {
  // 多区域支持
  ranges: SelectedRange[];     // 多区域数组
  totalCells: number;          // 总单元格数
  isMultiSelect: boolean;      // 是否多选模式

  // 向后兼容字段（指向第一个区域）
  address: string;
  sheetName: string;
  values: any[][] | null;
  formulas: string[][] | null;
  rowCount: number;
  columnCount: number;
  hasData: boolean;
}

// ─── 常量配置 ──────────────────────────────────────────────────────────────────

const MAX_RANGES = 10;                    // 最大区域数量
const MAX_CELLS_FOR_FULL_LOAD = 500;      // 完整加载上限（从100提升到500）
const MAX_CELLS_FOR_PREVIEW = 50000;      // 预览上限
const PREVIEW_ROWS = 10;                  // 预览行数（从3提升到10）
const PREVIEW_COLS = 10;                  // 预览列数（从5提升到10）

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 从完整地址中提取工作表名称
 * "Sheet1!A1:B10" -> "Sheet1"
 * "A1:B10" -> 当前工作表名称（需要额外处理）
 */
function extractSheetName(address: string): string {
  const match = address.match(/^(.+)!.+$/);
  return match ? match[1] : '';
}

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Hook 实现 ─────────────────────────────────────────────────────────────────

export function useExcelContext() {
  const [context, setContext] = useState<ExcelContext>({
    ranges: [],
    totalCells: 0,
    isMultiSelect: false,
    // 向后兼容字段
    address: '',
    sheetName: '',
    values: null,
    formulas: null,
    rowCount: 0,
    columnCount: 0,
    hasData: false,
  });

  const [isLoading, setIsLoading] = useState(false);

  const updateContext = useCallback(async () => {
    if (!window.Excel) {
      console.log('[ExcelContext] Excel API not available');
      return;
    }

    setIsLoading(true);

    try {
      await Excel.run(async (excelContext) => {
        // 尝试使用多区域API (Excel.js 1.4+)
        const hasMultiSelectAPI = typeof excelContext.workbook.getSelectedRanges === 'function';

        if (hasMultiSelectAPI) {
          // 使用多区域API
          const selectedRanges = excelContext.workbook.getSelectedRanges();
          selectedRanges.load('areas');
          await excelContext.sync();

          // RangeAreas.areas 是 RangeCollection，需要进一步加载 items
          const areasCollection = selectedRanges.areas;
          areasCollection.load('items');
          await excelContext.sync();

          const rangesCount = areasCollection.items.length;
          console.log(`[ExcelContext] Multi-select: ${rangesCount} range(s)`);

          // 限制最大区域数量
          const effectiveRanges = areasCollection.items.slice(0, MAX_RANGES);
          if (rangesCount > MAX_RANGES) {
            console.warn(`[ExcelContext] Truncated to ${MAX_RANGES} ranges from ${rangesCount}`);
          }

          // 预加载所有区域的基本信息
          for (const range of effectiveRanges) {
            range.load(['address', 'rowCount', 'columnCount']);
          }
          await excelContext.sync();

          // 计算总单元格数
          let totalCells = 0;
          for (const range of effectiveRanges) {
            totalCells += range.rowCount * range.columnCount;
          }
          console.log(`[ExcelContext] Total cells: ${totalCells.toLocaleString()}`);

          // 决定加载策略
          const loadFullData = totalCells <= MAX_CELLS_FOR_FULL_LOAD;
          const loadPreview = totalCells <= MAX_CELLS_FOR_PREVIEW;

          // 加载每个区域的数据
          const loadedRanges: SelectedRange[] = [];

          for (let i = 0; i < effectiveRanges.length; i++) {
            const range = effectiveRanges[i];
            const cellCount = range.rowCount * range.columnCount;
            const sheetName = extractSheetName(range.address);

            let values: any[][] | null = null;
            let formulas: string[][] | null = null;
            let isPreview = false;

            if (!loadPreview) {
              // 太大，不加载数据
              console.log(`[ExcelContext] Range ${i + 1} too large, skipping data`);
            } else if (loadFullData) {
              // 完整加载
              console.log(`[ExcelContext] Range ${i + 1}: loading full data`);
              range.load(['values', 'formulas']);
              await excelContext.sync();
              values = range.values;
              formulas = range.formulas;
            } else {
              // 预览加载
              console.log(`[ExcelContext] Range ${i + 1}: loading preview`);
              const previewRows = Math.min(PREVIEW_ROWS, range.rowCount);
              const previewCols = Math.min(PREVIEW_COLS, range.columnCount);

              try {
                const previewRange = range.getCell(0, 0).getResizedRange(previewRows - 1, previewCols - 1);
                previewRange.load(['values', 'formulas']);
                await excelContext.sync();
                values = previewRange.values;
                formulas = previewRange.formulas;
                isPreview = true;
              } catch (previewError) {
                console.error(`[ExcelContext] Range ${i + 1} preview error:`, previewError);
              }
            }

            loadedRanges.push({
              id: generateId(),
              index: i + 1,
              address: range.address,
              sheetName,
              values,
              formulas,
              rowCount: range.rowCount,
              columnCount: range.columnCount,
              cellCount,
              isPreview,
            });
          }

          // 构建新的上下文
          const firstRange = loadedRanges[0];
          const newContext: ExcelContext = {
            ranges: loadedRanges,
            totalCells,
            isMultiSelect: loadedRanges.length > 1,
            // 向后兼容
            address: firstRange?.address || '',
            sheetName: firstRange?.sheetName || '',
            values: firstRange?.values || null,
            formulas: firstRange?.formulas || null,
            rowCount: firstRange?.rowCount || 0,
            columnCount: firstRange?.columnCount || 0,
            hasData: loadedRanges.some(r => r.values && r.values.length > 0),
          };

          console.log('[ExcelContext] Context updated:', {
            rangeCount: loadedRanges.length,
            totalCells,
            isMultiSelect: loadedRanges.length > 1,
          });

          setContext(newContext);
        } else {
          // 回退到单区域API（兼容旧版本）
          console.log('[ExcelContext] Using legacy single-range API');
          const sheet = excelContext.workbook.worksheets.getActiveWorksheet();
          const range = excelContext.workbook.getSelectedRange();

          sheet.load('name');
          range.load(['address', 'rowCount', 'columnCount']);
          await excelContext.sync();

          const cellCount = range.rowCount * range.columnCount;
          const sheetName = sheet.name;

          let values: any[][] | null = null;
          let formulas: string[][] | null = null;
          let hasData = false;

          if (cellCount <= MAX_CELLS_FOR_FULL_LOAD) {
            range.load(['values', 'formulas']);
            await excelContext.sync();
            values = range.values;
            formulas = range.formulas;
            hasData = values && values.length > 0 && values.some(row => row.some(cell => cell !== null && cell !== ''));
          } else if (cellCount <= MAX_CELLS_FOR_PREVIEW) {
            const previewRows = Math.min(PREVIEW_ROWS, range.rowCount);
            const previewCols = Math.min(PREVIEW_COLS, range.columnCount);
            const previewRange = range.getCell(0, 0).getResizedRange(previewRows - 1, previewCols - 1);
            previewRange.load(['values', 'formulas']);
            await excelContext.sync();
            values = previewRange.values;
            formulas = previewRange.formulas;
            hasData = true;
          } else {
            hasData = true;
          }

          const singleRange: SelectedRange = {
            id: generateId(),
            index: 1,
            address: range.address,
            sheetName,
            values,
            formulas,
            rowCount: range.rowCount,
            columnCount: range.columnCount,
            cellCount,
            isPreview: cellCount > MAX_CELLS_FOR_FULL_LOAD,
          };

          const newContext: ExcelContext = {
            ranges: [singleRange],
            totalCells: cellCount,
            isMultiSelect: false,
            // 向后兼容
            address: range.address,
            sheetName,
            values,
            formulas,
            rowCount: range.rowCount,
            columnCount: range.columnCount,
            hasData,
          };

          setContext(newContext);
        }
      });
    } catch (error) {
      console.error('[ExcelContext] Error updating Excel context:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 监听选择变化
  useEffect(() => {
    if (!window.Excel) {
      console.log('[ExcelContext] Excel API not available, skipping event setup');
      return;
    }

    updateContext();

    const setupEventHandler = async () => {
      try {
        await Excel.run(async (context) => {
          const sheet = context.workbook.worksheets.getActiveWorksheet();
          sheet.onSelectionChanged.add(async () => {
            setTimeout(updateContext, 100);
          });
          await context.sync();
          console.log('[ExcelContext] Selection change listener registered');
        });
      } catch (error) {
        console.error('[ExcelContext] Error setting up selection change listener:', error);
      }
    };

    setupEventHandler();
  }, [updateContext]);

  // 高亮区域
  const highlightRange = useCallback(async (address: string, color: string = '#FFE6CC') => {
    if (!window.Excel) return;

    try {
      await Excel.run(async (context) => {
        // 解析地址中的工作表名
        const match = address.match(/^(.+)!(.+)$/);
        let range;
        if (match) {
          const sheetName = match[1];
          const rangeAddr = match[2];
          const sheet = context.workbook.worksheets.getItem(sheetName);
          range = sheet.getRange(rangeAddr);
        } else {
          const sheet = context.workbook.worksheets.getActiveWorksheet();
          range = sheet.getRange(address);
        }
        range.format.fill.color = color;
        await context.sync();
      });
    } catch (error) {
      console.error('Error highlighting range:', error);
    }
  }, []);

  // 清除高亮
  const clearHighlight = useCallback(async (address: string) => {
    if (!window.Excel) return;

    try {
      await Excel.run(async (context) => {
        const match = address.match(/^(.+)!(.+)$/);
        let range;
        if (match) {
          const sheetName = match[1];
          const rangeAddr = match[2];
          const sheet = context.workbook.worksheets.getItem(sheetName);
          range = sheet.getRange(rangeAddr);
        } else {
          const sheet = context.workbook.worksheets.getActiveWorksheet();
          range = sheet.getRange(address);
        }
        range.format.fill.clear();
        await context.sync();
      });
    } catch (error) {
      console.error('Error clearing highlight:', error);
    }
  }, []);

  // 选择区域
  const selectRange = useCallback(async (address: string) => {
    if (!window.Excel) return;

    try {
      await Excel.run(async (context) => {
        const match = address.match(/^(.+)!(.+)$/);
        let range;
        if (match) {
          const sheetName = match[1];
          const rangeAddr = match[2];
          const sheet = context.workbook.worksheets.getItem(sheetName);
          range = sheet.getRange(rangeAddr);
        } else {
          const sheet = context.workbook.worksheets.getActiveWorksheet();
          range = sheet.getRange(address);
        }
        range.select();
        await context.sync();
      });
    } catch (error) {
      console.error('Error selecting range:', error);
    }
  }, []);

  return {
    context,
    isLoading,
    updateContext,
    highlightRange,
    clearHighlight,
    selectRange,
  };
}