import { jsPDF } from 'jspdf';
import fs from 'fs';

export class PDFBuilder {
  constructor(options = {}) {
    this.doc = new jsPDF({
      unit: 'pt',
      format: 'a4', // 595.28 x 841.89 pt
      orientation: 'portrait',
      compress: true,
    });

    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();

    this.marginLeft = options.marginLeft || 42;
    this.marginRight = options.marginRight || 42;
    this.marginTop = options.marginTop || 54;
    this.marginBottom = options.marginBottom || 54;

    this.contentWidth = this.pageWidth - this.marginLeft - this.marginRight;
    this.contentHeight = this.pageHeight - this.marginTop - this.marginBottom;

    this.headerSubtitle = options.headerSubtitle || 'UNIFIED MOBILE APPLICATION PRODUCT SPECIFICATION';
    this.footerTitle = options.footerTitle || 'CONFIDENTIAL & PROPRIETARY — SYSTEM SPECIFICATION';
    this.cursorY = this.marginTop;
    this.currentSection = 'Specification';
    this.tocItems = [];

    // Color Palette Tokens
    this.colors = {
      primary: [16, 185, 129], // Emerald #10B981
      primaryDark: [6, 95, 70], // Dark Emerald #065F46
      primaryLight: [209, 250, 229], // Light Emerald tint #D1FAE5
      navy: [15, 23, 42], // Slate 900 #0F172A
      ink: [30, 41, 59], // Slate 800 #1E293B
      inkSoft: [100, 116, 139], // Slate 500 #64748B
      line: [226, 232, 240], // Slate 200 #E2E8F0
      lineLight: [241, 245, 249], // Slate 100 #F1F5F9
      surface: [255, 255, 255],
      surfaceSunken: [248, 250, 252], // Slate 50 #F8FAFC
      amber: [217, 119, 6], // Amber 600
      amberBg: [254, 243, 199], // Amber 100
      blue: [37, 99, 235], // Blue 600
      blueBg: [219, 234, 254], // Blue 100
      crimson: [220, 38, 38], // Red 600
      crimsonBg: [254, 226, 226], // Red 100
    };
  }

  setSection(sectionName) {
    this.currentSection = sectionName;
  }

  checkPageBreak(neededHeight) {
    if (this.cursorY + neededHeight > this.pageHeight - this.marginBottom) {
      this.doc.addPage();
      this.cursorY = this.marginTop;
      return true;
    }
    return false;
  }

  addPageBreak() {
    this.doc.addPage();
    this.cursorY = this.marginTop;
  }

  // Cover Page
  renderCoverPage({ title, subtitle, documentType, version, date, author, targetRoles, excludedRoles }) {
    // Background accent bar
    this.doc.setFillColor(...this.colors.navy);
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight * 0.42, 'F');

    // Emerald accent stripe
    this.doc.setFillColor(...this.colors.primary);
    this.doc.rect(0, this.pageHeight * 0.42, this.pageWidth, 8, 'F');

    // Brand Pill
    this.doc.setFillColor(...this.colors.primaryDark);
    this.doc.roundedRect(this.marginLeft, 65, 150, 28, 6, 6, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(255, 255, 255);
    this.doc.text('PROPITHUB PLATFORM', this.marginLeft + 14, 83);

    // Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(28);
    this.doc.setTextColor(255, 255, 255);
    const titleLines = this.doc.splitTextToSize(title, this.contentWidth);
    this.doc.text(titleLines, this.marginLeft, 130);

    const titleH = titleLines.length * 34;

    // Subtitle
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(14);
    this.doc.setTextColor(209, 250, 229);
    const subLines = this.doc.splitTextToSize(subtitle, this.contentWidth);
    this.doc.text(subLines, this.marginLeft, 135 + titleH);

    // Document Meta Cards below stripe
    let y = this.pageHeight * 0.42 + 40;

    // Spec Overview Box
    this.doc.setFillColor(...this.colors.surfaceSunken);
    this.doc.setDrawColor(...this.colors.line);
    this.doc.roundedRect(this.marginLeft, y, this.contentWidth, 110, 8, 8, 'FD');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.setTextColor(...this.colors.navy);
    this.doc.text('ARCHITECTURE & SPECIFICATION SCOPE', this.marginLeft + 18, y + 26);

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(...this.colors.ink);
    this.doc.text(`Document Version: ${version}  |  Classification: Formal Architectural Blueprint`, this.marginLeft + 18, y + 46);
    this.doc.text(`Effective Release Date: ${date}  |  Compiled By: ${author}`, this.marginLeft + 18, y + 62);

    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...this.colors.primaryDark);
    this.doc.text(`Target Roles (Unified App): ${targetRoles.join(', ')}`, this.marginLeft + 18, y + 80);

    this.doc.setTextColor(...this.colors.crimson);
    this.doc.text(`Strictly Excluded Role: ${excludedRoles.join(', ')} (Web Management Portal Only)`, this.marginLeft + 18, y + 96);

    y += 135;

    // Key Highlights Grid
    const colW = (this.contentWidth - 20) / 3;

    const cards = [
      {
        title: 'Single Codebase',
        desc: 'One unified application dynamically adapting UI, navigation, and features based on verified user credentials.',
        badge: 'Zero Redundancy',
      },
      {
        title: 'Zero-Financial Manager',
        desc: 'Strict role boundaries ensuring delegated Property Managers have full facility controls with zero financial exposure.',
        badge: 'Hard RBAC Wall',
      },
      {
        title: 'Complete Lifecycle',
        desc: 'End-to-end coverage: Lease dispatch, digital signing, rent invoicing, cash claims, move-out settlement, technician dispatch.',
        badge: '26 Modules',
      },
    ];

    cards.forEach((card, i) => {
      const cx = this.marginLeft + i * (colW + 10);
      this.doc.setFillColor(255, 255, 255);
      this.doc.setDrawColor(...this.colors.line);
      this.doc.roundedRect(cx, y, colW, 140, 8, 8, 'FD');

      this.doc.setFillColor(...this.colors.primaryLight);
      this.doc.roundedRect(cx + 12, y + 14, colW - 24, 18, 4, 4, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...this.colors.primaryDark);
      this.doc.text(card.badge, cx + 18, y + 26);

      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(11);
      this.doc.setTextColor(...this.colors.navy);
      this.doc.text(card.title, cx + 12, y + 54);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(...this.colors.inkSoft);
      const descLines = this.doc.splitTextToSize(card.desc, colW - 24);
      this.doc.text(descLines, cx + 12, y + 72);
    });

    // Bottom Notice
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...this.colors.inkSoft);
    this.doc.text(
      'This document contains the complete, authoritative product specification, business logic inventory, and mobile UX blueprints.',
      this.marginLeft,
      this.pageHeight - 40
    );

    this.addPageBreak();
  }

  // Heading 1 (Major Section)
  h1(number, title) {
    this.checkPageBreak(70);
    this.setSection(`Section ${number}: ${title}`);

    this.cursorY += 12;

    // Number Badge
    this.doc.setFillColor(...this.colors.primary);
    this.doc.roundedRect(this.marginLeft, this.cursorY, 26, 20, 4, 4, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.setTextColor(255, 255, 255);
    const numStr = String(number);
    const numX = numStr.length === 1 ? this.marginLeft + 9 : this.marginLeft + 6;
    this.doc.text(numStr, numX, this.cursorY + 14);

    // Title Text
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(...this.colors.navy);
    this.doc.text(title.toUpperCase(), this.marginLeft + 34, this.cursorY + 15);

    this.cursorY += 26;

    // Accent line
    this.doc.setDrawColor(...this.colors.primary);
    this.doc.setLineWidth(1.5);
    this.doc.line(this.marginLeft, this.cursorY, this.marginLeft + 60, this.cursorY);
    this.doc.setDrawColor(...this.colors.line);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.marginLeft + 60, this.cursorY, this.marginLeft + this.contentWidth, this.cursorY);

    this.cursorY += 16;
  }

  // Heading 2 (Subsection)
  h2(title) {
    this.checkPageBreak(45);
    this.cursorY += 8;

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13);
    this.doc.setTextColor(...this.colors.navy);
    this.doc.text(title, this.marginLeft, this.cursorY);

    this.cursorY += 6;
    this.doc.setDrawColor(...this.colors.line);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.marginLeft, this.cursorY, this.marginLeft + this.contentWidth, this.cursorY);

    this.cursorY += 12;
  }

  // Heading 3 (Sub-subsection)
  h3(title) {
    this.checkPageBreak(35);
    this.cursorY += 6;

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...this.colors.primaryDark);
    this.doc.text(title, this.marginLeft, this.cursorY);

    this.cursorY += 12;
  }

  // Heading 4
  h4(title) {
    this.checkPageBreak(25);
    this.cursorY += 4;

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...this.colors.ink);
    this.doc.text(title, this.marginLeft, this.cursorY);

    this.cursorY += 10;
  }

  // Paragraph
  p(text, options = {}) {
    this.doc.setFont('helvetica', options.bold ? 'bold' : options.italic ? 'italic' : 'normal');
    this.doc.setFontSize(options.size || 9.5);
    this.doc.setTextColor(...(options.color || this.colors.ink));

    const lines = this.doc.splitTextToSize(text, this.contentWidth - (options.indent || 0));
    const lineHeight = (options.size || 9.5) * 1.35;

    this.checkPageBreak(lines.length * lineHeight + 6);

    lines.forEach((line) => {
      this.doc.text(line, this.marginLeft + (options.indent || 0), this.cursorY);
      this.cursorY += lineHeight;
    });

    this.cursorY += options.marginBottom !== undefined ? options.marginBottom : 4;
  }

  // Bullet Point
  bullet(title, text, options = {}) {
    const indent = options.indent || 14;
    const bulletX = this.marginLeft + indent - 10;
    const textX = this.marginLeft + indent;
    const textW = this.contentWidth - indent;

    this.doc.setFontSize(options.size || 9);
    const lineHeight = (options.size || 9) * 1.35;

    let fullText = text;
    if (title) {
      fullText = `${title}: ${text}`;
    }

    const lines = this.doc.splitTextToSize(fullText, textW);
    this.checkPageBreak(lines.length * lineHeight + 4);

    // Bullet dot
    this.doc.setFillColor(...(options.bulletColor || this.colors.primary));
    this.doc.circle(bulletX, this.cursorY - 3, 2, 'F');

    // Text with bold title if provided
    lines.forEach((line, idx) => {
      if (idx === 0 && title) {
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...this.colors.navy);
        this.doc.text(`${title}: `, textX, this.cursorY);
        const titleW = this.doc.getTextWidth(`${title}: `);

        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(...this.colors.ink);
        const remainder = line.substring(title.length + 2);
        this.doc.text(remainder, textX + titleW, this.cursorY);
      } else {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(...this.colors.ink);
        this.doc.text(line, textX, this.cursorY);
      }
      this.cursorY += lineHeight;
    });

    this.cursorY += 2;
  }

  // Callout Box (Note, Alert, Important, Restriction)
  callout(title, text, type = 'note') {
    let borderColor = this.colors.primary;
    let bgColor = this.colors.primaryLight;
    let titleColor = this.colors.primaryDark;

    if (type === 'warning' || type === 'amber') {
      borderColor = this.colors.amber;
      bgColor = this.colors.amberBg;
      titleColor = [180, 83, 9];
    } else if (type === 'error' || type === 'restriction' || type === 'red') {
      borderColor = this.colors.crimson;
      bgColor = this.colors.crimsonBg;
      titleColor = this.colors.crimson;
    } else if (type === 'info' || type === 'blue') {
      borderColor = this.colors.blue;
      bgColor = this.colors.blueBg;
      titleColor = this.colors.blue;
    }

    const boxW = this.contentWidth;
    this.doc.setFontSize(9);
    const lines = this.doc.splitTextToSize(text, boxW - 24);
    const boxH = lines.length * 12 + 28;

    this.checkPageBreak(boxH + 8);

    // Background
    this.doc.setFillColor(...bgColor);
    this.doc.setDrawColor(...this.colors.line);
    this.doc.roundedRect(this.marginLeft, this.cursorY, boxW, boxH, 6, 6, 'FD');

    // Colored left indicator bar
    this.doc.setFillColor(...borderColor);
    this.doc.rect(this.marginLeft, this.cursorY, 4, boxH, 'F');

    // Title
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...titleColor);
    this.doc.text(title.toUpperCase(), this.marginLeft + 14, this.cursorY + 16);

    // Body
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...this.colors.ink);
    lines.forEach((line, i) => {
      this.doc.text(line, this.marginLeft + 14, this.cursorY + 30 + i * 12);
    });

    this.cursorY += boxH + 8;
  }

  // Key-Value Grid
  keyValueGrid(items, columns = 2) {
    const colW = (this.contentWidth - (columns - 1) * 10) / columns;
    const rowH = 24;

    for (let i = 0; i < items.length; i += columns) {
      this.checkPageBreak(rowH + 4);

      for (let c = 0; c < columns; c++) {
        const item = items[i + c];
        if (!item) continue;

        const x = this.marginLeft + c * (colW + 10);
        this.doc.setFillColor(...this.colors.surfaceSunken);
        this.doc.setDrawColor(...this.colors.line);
        this.doc.roundedRect(x, this.cursorY, colW, rowH - 4, 4, 4, 'FD');

        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...this.colors.inkSoft);
        this.doc.text(item.key.toUpperCase(), x + 8, this.cursorY + 10);

        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(9);
        this.doc.setTextColor(...this.colors.navy);
        this.doc.text(String(item.value), x + 8, this.cursorY + 20);
      }

      this.cursorY += rowH;
    }

    this.cursorY += 4;
  }

  // Data Table
  table(headers, rows, options = {}) {
    const colWidths = options.colWidths || headers.map(() => this.contentWidth / headers.length);
    const headerH = 22;
    const rowMinH = 20;

    this.checkPageBreak(headerH + rowMinH * 2);

    // Header Row
    let x = this.marginLeft;
    this.doc.setFillColor(...this.colors.navy);
    this.doc.rect(this.marginLeft, this.cursorY, this.contentWidth, headerH, 'F');

    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(255, 255, 255);

    headers.forEach((h, idx) => {
      const w = colWidths[idx];
      this.doc.text(h, x + 6, this.cursorY + 14);
      x += w;
    });

    this.cursorY += headerH;

    // Body Rows
    rows.forEach((row, rowIdx) => {
      // Calculate row height based on longest cell text
      let maxCellLines = 1;
      const cellTextLines = row.map((cell, idx) => {
        const w = colWidths[idx] - 12;
        const text = String(cell !== undefined && cell !== null ? cell : '');
        this.doc.setFontSize(8);
        const lines = this.doc.splitTextToSize(text, w);
        if (lines.length > maxCellLines) maxCellLines = lines.length;
        return lines;
      });

      const actualRowH = Math.max(rowMinH, maxCellLines * 11 + 8);
      this.checkPageBreak(actualRowH);

      // Alternating row background
      if (rowIdx % 2 === 1) {
        this.doc.setFillColor(...this.colors.surfaceSunken);
      } else {
        this.doc.setFillColor(255, 255, 255);
      }
      this.doc.rect(this.marginLeft, this.cursorY, this.contentWidth, actualRowH, 'F');

      // Cell borders
      this.doc.setDrawColor(...this.colors.line);
      this.doc.setLineWidth(0.5);
      this.doc.line(this.marginLeft, this.cursorY + actualRowH, this.marginLeft + this.contentWidth, this.cursorY + actualRowH);

      // Cell texts
      let cellX = this.marginLeft;
      row.forEach((cell, idx) => {
        const w = colWidths[idx];
        const lines = cellTextLines[idx];

        this.doc.setFont('helvetica', idx === 0 && options.boldFirstCol ? 'bold' : 'normal');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...this.colors.ink);

        lines.forEach((line, lIdx) => {
          this.doc.text(line, cellX + 6, this.cursorY + 12 + lIdx * 11);
        });

        // Vertical separator line
        this.doc.setDrawColor(...this.colors.line);
        this.doc.line(cellX, this.cursorY, cellX, this.cursorY + actualRowH);

        cellX += w;
      });
      // Right border
      this.doc.line(this.marginLeft + this.contentWidth, this.cursorY, this.marginLeft + this.contentWidth, this.cursorY + actualRowH);

      this.cursorY += actualRowH;
    });

    this.cursorY += 8;
  }

  // Mobile Screen Mockup / Blueprint Wireframe
  drawMobileWireframe({ title, role, screenName, elements, bottomTabs, activeTabIndex = 0 }) {
    const frameW = 220;
    const frameH = 340;

    this.checkPageBreak(frameH + 30);

    const x = this.marginLeft + (this.contentWidth - frameW) / 2;
    const y = this.cursorY;

    // Phone Outer Body
    this.doc.setFillColor(...this.colors.navy);
    this.doc.roundedRect(x - 6, y - 6, frameW + 12, frameH + 12, 22, 22, 'F');

    // Phone Inner Screen
    this.doc.setFillColor(255, 255, 255);
    this.doc.roundedRect(x, y, frameW, frameH, 16, 16, 'F');

    // Speaker / Notch
    this.doc.setFillColor(...this.colors.navy);
    this.doc.roundedRect(x + frameW / 2 - 30, y + 4, 60, 8, 4, 4, 'F');

    // Status bar (Time & Battery)
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.setTextColor(...this.colors.inkSoft);
    this.doc.text('9:41', x + 14, y + 14);
    this.doc.text('5G  100%', x + frameW - 44, y + 14);

    // Mobile App Header
    this.doc.setFillColor(...this.colors.surfaceSunken);
    this.doc.rect(x, y + 20, frameW, 32, 'F');
    this.doc.setDrawColor(...this.colors.line);
    this.doc.line(x, y + 52, x + frameW, y + 52);

    // Screen Title & Role Pill
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9.5);
    this.doc.setTextColor(...this.colors.navy);
    this.doc.text(screenName, x + 12, y + 36);

    this.doc.setFillColor(...this.colors.primaryLight);
    this.doc.roundedRect(x + frameW - 74, y + 26, 62, 14, 3, 3, 'F');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...this.colors.primaryDark);
    this.doc.text(role.toUpperCase(), x + frameW - 70, y + 36);

    // Screen Content Elements
    let ey = y + 60;
    elements.forEach((el) => {
      if (el.type === 'kpi') {
        this.doc.setFillColor(...this.colors.surfaceSunken);
        this.doc.setDrawColor(...this.colors.line);
        this.doc.roundedRect(x + 10, ey, frameW - 20, 34, 4, 4, 'FD');
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(6.5);
        this.doc.setTextColor(...this.colors.inkSoft);
        this.doc.text(el.label.toUpperCase(), x + 18, ey + 12);
        this.doc.setFontSize(11);
        this.doc.setTextColor(...this.colors.navy);
        this.doc.text(el.value, x + 18, ey + 26);
        ey += 40;
      } else if (el.type === 'card') {
        this.doc.setFillColor(255, 255, 255);
        this.doc.setDrawColor(...this.colors.line);
        this.doc.roundedRect(x + 10, ey, frameW - 20, el.height || 42, 4, 4, 'FD');
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...this.colors.navy);
        this.doc.text(el.title, x + 16, ey + 14);

        if (el.subtitle) {
          this.doc.setFont('helvetica', 'normal');
          this.doc.setFontSize(7);
          this.doc.setTextColor(...this.colors.inkSoft);
          this.doc.text(el.subtitle, x + 16, ey + 25);
        }
        if (el.badge) {
          this.doc.setFillColor(...this.colors.primaryLight);
          this.doc.roundedRect(x + frameW - 64, ey + 8, 48, 12, 3, 3, 'F');
          this.doc.setFont('helvetica', 'bold');
          this.doc.setFontSize(6);
          this.doc.setTextColor(...this.colors.primaryDark);
          this.doc.text(el.badge, x + frameW - 60, ey + 16);
        }
        ey += (el.height || 42) + 6;
      } else if (el.type === 'button') {
        this.doc.setFillColor(...(el.color === 'secondary' ? this.colors.surfaceSunken : this.colors.primary));
        this.doc.setDrawColor(...(el.color === 'secondary' ? this.colors.line : this.colors.primary));
        this.doc.roundedRect(x + 10, ey, frameW - 20, 24, 4, 4, 'FD');
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(7.5);
        this.doc.setTextColor(...(el.color === 'secondary' ? this.colors.ink : [255, 255, 255]));
        const tw = this.doc.getTextWidth(el.text);
        this.doc.text(el.text, x + (frameW - tw) / 2, ey + 15);
        ey += 30;
      }
    });

    // Mobile Bottom Tab Navigation Bar
    const tabH = 34;
    const tabY = y + frameH - tabH;
    this.doc.setFillColor(255, 255, 255);
    this.doc.setDrawColor(...this.colors.line);
    this.doc.line(x, tabY, x + frameW, tabY);

    if (bottomTabs && bottomTabs.length > 0) {
      const tabW = frameW / bottomTabs.length;
      bottomTabs.forEach((tab, tIdx) => {
        const tx = x + tIdx * tabW;
        const isActive = tIdx === activeTabIndex;

        // Active indicator line
        if (isActive) {
          this.doc.setFillColor(...this.colors.primary);
          this.doc.rect(tx + 6, tabY, tabW - 12, 2, 'F');
        }

        this.doc.setFont('helvetica', isActive ? 'bold' : 'normal');
        this.doc.setFontSize(6.5);
        this.doc.setTextColor(...(isActive ? this.colors.primaryDark : this.colors.inkSoft));
        const tw = this.doc.getTextWidth(tab);
        this.doc.text(tab, tx + (tabW - tw) / 2, tabY + 22);
      });
    }

    // Label caption beneath frame
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...this.colors.navy);
    const caption = `Figure: ${title}`;
    const cw = this.doc.getTextWidth(caption);
    this.doc.text(caption, this.marginLeft + (this.contentWidth - cw) / 2, y + frameH + 22);

    this.cursorY = y + frameH + 34;
  }

  // Finalize document: Apply running headers and footers to all pages except cover
  finalize() {
    const totalPages = this.doc.getNumberOfPages();

    for (let p = 2; p <= totalPages; p++) {
      this.doc.setPage(p);

      // Running Header
      this.doc.setFillColor(...this.colors.primary);
      this.doc.rect(this.marginLeft, 24, 6, 6, 'F');

      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...this.colors.navy);
      this.doc.text('PROPITHUB PLATFORM', this.marginLeft + 12, 30);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...this.colors.inkSoft);
      this.doc.text(this.headerSubtitle, this.marginLeft + 115, 30);

      // Header rule
      this.doc.setDrawColor(...this.colors.line);
      this.doc.setLineWidth(0.5);
      this.doc.line(this.marginLeft, 36, this.marginLeft + this.contentWidth, 36);

      // Running Footer rule
      this.doc.line(this.marginLeft, this.pageHeight - 34, this.marginLeft + this.contentWidth, this.pageHeight - 34);

      // Running Footer
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7);
      this.doc.setTextColor(...this.colors.inkSoft);
      this.doc.text(this.footerTitle, this.marginLeft, this.pageHeight - 22);

      const pageStr = `Page ${p} of ${totalPages}`;
      const pw = this.doc.getTextWidth(pageStr);
      this.doc.text(pageStr, this.marginLeft + this.contentWidth - pw, this.pageHeight - 22);
    }
  }

  save(filepath) {
    this.finalize();
    const buffer = Buffer.from(this.doc.output('arraybuffer'));
    fs.writeFileSync(filepath, buffer);
    console.log(`Document successfully saved to ${filepath} (${buffer.length} bytes, ${this.doc.getNumberOfPages()} pages)`);
  }
}
