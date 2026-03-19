import { useState } from 'react';
import { Badge } from '@fluentui/react-components';
import { Table24Regular, Document24Regular, ChevronDown16Regular, ChevronUp16Regular, Layer24Regular } from '@fluentui/react-icons';
import type { ExcelContext as ExcelContextType, SelectedRange } from '../hooks/useExcelContext';
import '../styles/excel-context.css';

interface ExcelContextProps {
  context: ExcelContextType;
  isLoading: boolean;
}

export default function ExcelContext({ context, isLoading }: ExcelContextProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="excel-context loading" role="status" aria-label="Loading Excel context">
        <div className="excel-context-skeleton" />
      </div>
    );
  }

  if (!context.address) {
    return null;
  }

  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') {
      return value.toLocaleString();
    }
    return String(value);
  };

  const getPreviewData = (range: SelectedRange, totalCells: number): string => {
    if (!range.values || range.values.length === 0) {
      if (totalCells > 50000) {
        return `Very large (${totalCells.toLocaleString()} cells)`;
      }
      return 'No data';
    }

    const isLargeSelection = totalCells > 100;
    const maxPreview = 3;
    const firstRow = range.values[0];
    if (!firstRow) return 'No data';

    const preview = firstRow.slice(0, maxPreview).map(formatCellValue).join(', ');
    const hasMore = firstRow.length > maxPreview || range.values.length > 1;

    if (isLargeSelection) {
      return `${preview}... (${totalCells.toLocaleString()} cells)`;
    }

    return preview + (hasMore ? '...' : '');
  };

  const getCellInfo = (range?: SelectedRange): string => {
    const rc = range?.rowCount ?? context.rowCount;
    const cc = range?.columnCount ?? context.columnCount;
    if (rc === 1 && cc === 1) {
      return '1 cell';
    }
    return `${rc} × ${cc} cells`;
  };

  // 格式化多区域地址摘要
  const getRangesSummary = (): string => {
    if (!context.isMultiSelect) {
      return context.address;
    }

    const addresses = context.ranges.map(r => {
      // 简化地址显示：同sheet只显示一次sheet名
      const match = r.address.match(/^(.+)!(.+)$/);
      if (match) {
        return match[2]; // 只返回单元格地址部分
      }
      return r.address;
    });

    if (addresses.length <= 3) {
      return `${addresses.join(', ')} (${context.ranges.length} ranges)`;
    }

    return `${addresses.slice(0, 2).join(', ')}... +${addresses.length - 2} more`;
  };

  // 渲染单个区域
  const renderRangeItem = (range: SelectedRange) => {
    const hasFormulas = range.formulas?.some(row => row.some(f => typeof f === 'string' && f.startsWith('=')));

    return (
      <div key={range.id} className="excel-context-range-item">
        <div className="excel-context-range-header">
          <span className="excel-context-range-index">区域{range.index}</span>
          <span className="excel-context-range-address">{range.address}</span>
          <Badge appearance="tint" size="small">
            {getCellInfo(range)}
          </Badge>
          {range.isPreview && (
            <Badge appearance="outline" size="small" className="excel-context-badge-preview">
              Preview
            </Badge>
          )}
        </div>
        {range.values && range.values.length > 0 && (
          <div className="excel-context-range-preview">
            {getPreviewData(range, range.cellCount)}
          </div>
        )}
        {hasFormulas && (
          <Badge appearance="outline" size="small" className="excel-context-badge">
            Formulas
          </Badge>
        )}
      </div>
    );
  };

  // 收起状态
  if (!isExpanded) {
    return (
      <button
        className="excel-context-collapsed"
        onClick={() => setIsExpanded(true)}
        aria-label="Expand Excel context"
        type="button"
      >
        {context.isMultiSelect ? (
          <Layer24Regular className="excel-context-collapsed-icon" />
        ) : (
          <Table24Regular className="excel-context-collapsed-icon" />
        )}
        <span className="excel-context-collapsed-text">
          {getRangesSummary()} · {context.totalCells.toLocaleString()} cells
        </span>
        <ChevronDown16Regular className="excel-context-chevron" />
      </button>
    );
  }

  // 展开状态 - 多区域
  if (context.isMultiSelect) {
    return (
      <div className="excel-context expanded excel-context-multi" role="complementary" aria-label="Current Excel selection">
        <div className="excel-context-header">
          <div className="excel-context-icon">
            <Layer24Regular />
          </div>
          <div className="excel-context-details">
            <div className="excel-context-title">
              <span className="excel-context-range">{context.ranges.length} 个区域</span>
              <Badge appearance="tint" size="small">
                {context.totalCells.toLocaleString()} cells
              </Badge>
            </div>
            <div className="excel-context-ranges-list">
              {context.ranges.slice(0, 3).map(r => r.address).join(', ')}
              {context.ranges.length > 3 && `... +${context.ranges.length - 3}`}
            </div>
          </div>
          <button
            className="excel-context-collapse-btn"
            onClick={() => setIsExpanded(false)}
            aria-label="Collapse Excel context"
            type="button"
          >
            <ChevronUp16Regular />
          </button>
        </div>

        <div className="excel-context-ranges-container">
          {context.ranges.map(renderRangeItem)}
        </div>
      </div>
    );
  }

  // 展开状态 - 单区域（保持原有UI）
  const firstRange = context.ranges[0];

  return (
    <div className="excel-context expanded" role="complementary" aria-label="Current Excel selection">
      <div className="excel-context-header">
        <div className="excel-context-icon">
          <Table24Regular />
        </div>
        <div className="excel-context-details">
          <div className="excel-context-title">
            <span className="excel-context-range">{context.address}</span>
            <Badge appearance="tint" size="small">
              {getCellInfo()}
            </Badge>
          </div>
          <div className="excel-context-subtitle">
            <Document24Regular className="sheet-icon" />
            <span>{context.sheetName}</span>
          </div>
        </div>
        <button
          className="excel-context-collapse-btn"
          onClick={() => setIsExpanded(false)}
          aria-label="Collapse Excel context"
          type="button"
        >
          <ChevronUp16Regular />
        </button>
      </div>

      {context.hasData && firstRange && (
        <div className="excel-context-preview">
          <div className="excel-context-preview-label">Preview:</div>
          <div className="excel-context-preview-content">{getPreviewData(firstRange, context.totalCells)}</div>
        </div>
      )}

      {context.hasData &&
        firstRange?.formulas &&
        firstRange.formulas.some((row) => row.some((f) => typeof f === 'string' && f.startsWith('='))) && (
          <Badge appearance="outline" size="small" className="excel-context-badge">
            Contains formulas
          </Badge>
        )}
    </div>
  );
}