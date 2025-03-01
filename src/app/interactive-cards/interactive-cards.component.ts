import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, HostListener, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Card {
  id: string;
  title: string;
  inputValue: string;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
}

interface Connector {
  from: Card;
  to: Card;
  path: SVGPathElement;
}

@Component({
  standalone: true,
  selector: 'app-interactive-cards',
  templateUrl: './interactive-cards.component.html',
  imports: [CommonModule, FormsModule],
  styleUrls: ['./interactive-cards.component.scss'],
})
export class InteractiveCardsComponent implements AfterViewInit {
  @ViewChild('zoomContainer') zoomContainer!: ElementRef;
  @ViewChild('svgContainer') svgContainer!: ElementRef<SVGSVGElement>;

  scale = 1;
  cardCount = 0;
  cards: Card[] = [];
  connectors: Connector[] = [];
  connectingFrom: Card | null = null;
  selectedCards: Card[] = [];
  clipboard: any[] = [];
  isSidebarOpen = false;
  isSelecting = false;
  selectionRect = { left: 0, top: 0, width: 0, height: 0 };
  startX = 0;
  startY = 0;

  gridSpacing = 50;

  readonly baseCardWidth = 250;
  readonly baseCardPadding = 15;
  readonly baseFontSize = 18;
  readonly baseInputPadding = 8;
  readonly borderWidth = 10;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.addNewCard(100, 100);
    this.addNewCard(400, 200);
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing}px`);
    this.cdr.detectChanges();
  }

  setGridSpacing(size: number): void {
    this.gridSpacing = Math.max(10, Math.min(200, size));
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`);
    this.adjustCardsAfterGridChange(); // Пересчитываем позиции после изменения сетки
    this.cdr.detectChanges();
  }

  adjustCardsAfterGridChange(): void {
    this.cards.forEach((card) => {
      card.baseX = this.snapToGrid(card.baseX);
      card.baseY = this.snapToGrid(card.baseY);
      card.baseWidth = this.snapToGrid(card.baseWidth);
      card.baseHeight = this.snapToGrid(card.baseHeight);
    });
    this.updateLines();
  }

  addNewCard(x = 100 / this.scale + this.cardCount * 50 / this.scale, y = 100 / this.scale + this.cardCount * 50 / this.scale): void {
    this.cardCount++;
    const newCard: Card = {
      id: `card${this.cardCount}`,
      title: `Card ${this.cardCount}`,
      inputValue: '',
      baseX: this.snapToGrid(x),
      baseY: this.snapToGrid(y),
      baseWidth: 200,
      baseHeight: 100,
    };
    this.cards.push(newCard);
    this.cdr.detectChanges();
  }

  snapToGrid(value: number): number {
    return Math.round(value / (this.gridSpacing * this.scale)) * (this.gridSpacing * this.scale);
  }

  zoom(delta: number): void {
    const newScale = this.scale * delta;
    if (newScale >= 0.5 && newScale <= 2) {
      this.scale = newScale;
      // Масштабируем базовые размеры и позиции карточек
      this.cards.forEach((card) => {
        card.baseX = card.baseX * delta;
        card.baseY = card.baseY * delta;
        card.baseWidth = card.baseWidth * delta;
        card.baseHeight = card.baseHeight * delta;
      });
      // Масштабируем сетку
      this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`);
      // Пересчитываем позиции, чтобы избежать перекрытий
      this.preventOverlapsAfterZoom();
      this.updateLines();
      this.cdr.detectChanges();
    }
  }

  preventOverlapsAfterZoom(): void {
    this.cards.forEach((card) => {
      let proposedX = card.baseX;
      let proposedY = card.baseY;
      const adjustedPosition = this.preventOverlap(card, proposedX, proposedY);
      card.baseX = adjustedPosition.x;
      card.baseY = adjustedPosition.y;
    });
  }

  updateLines(): void {
    const svg = this.svgContainer.nativeElement;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    this.connectors.forEach((connector) => {
      const fromCard = this.cards.find((c) => c === connector.from)!;
      const toCard = this.cards.find((c) => c === connector.to)!;
      const x1 = fromCard.baseX + (fromCard.baseWidth / 2);
      const y1 = fromCard.baseY + (fromCard.baseHeight / 2);
      const x2 = toCard.baseX + (toCard.baseWidth / 2);
      const y2 = toCard.baseY + (toCard.baseHeight / 2);

      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curveFactor = Math.min(distance * 0.3, 150 * this.scale);

      const cx1 = x1 + dx * 0.25 + (dy > 0 ? curveFactor : -curveFactor);
      const cy1 = y1 + dy * 0.25;
      const cx2 = x2 - dx * 0.25 + (dy > 0 ? -curveFactor : curveFactor);
      const cy2 = y2 - dy * 0.25;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke', 'white');
      path.setAttribute('stroke-width', (2 * this.scale).toString());
      path.setAttribute('fill', 'none');
      path.setAttribute('d', `M ${x1 * this.scale} ${y1 * this.scale} C ${cx1 * this.scale} ${cy1 * this.scale}, ${cx2 * this.scale} ${cy2 * this.scale}, ${x2 * this.scale} ${y2 * this.scale}`);
      svg.appendChild(path);
      connector.path = path;
    });
  }

  onCardMouseDown(event: MouseEvent, card: Card): void {
    if (event.target instanceof HTMLInputElement) return;
    if (!event.altKey) {
      const isResizing = this.isResizingEdge(card, event);
      if (isResizing) {
        this.handleResize(event, card);
      } else {
        if (event.ctrlKey || event.shiftKey) {
          if (this.selectedCards.includes(card)) {
            this.selectedCards = this.selectedCards.filter((c) => c !== card);
          } else {
            this.selectCard(card);
          }
        } else {
          if (!this.selectedCards.includes(card)) {
            this.clearSelection();
            this.selectCard(card);
          }
        }
        if (this.selectedCards.includes(card)) {
          this.handleDrag(event, card);
        }
      }
      event.preventDefault();
    }
  }

  handleDrag(event: MouseEvent, card: Card): void {
    const offsets = this.selectedCards.map((selectedCard) => ({
      card: selectedCard,
      offsetX: event.clientX - selectedCard.baseX * this.scale,
      offsetY: event.clientY - selectedCard.baseY * this.scale,
    }));

    const onMouseMove = (e: MouseEvent) => {
      offsets.forEach(({ card: selectedCard, offsetX, offsetY }) => {
        const newX = (e.clientX - offsetX) / this.scale;
        const newY = (e.clientY - offsetY) / this.scale;
        const adjustedPosition = this.preventOverlap(selectedCard, newX, newY);
        selectedCard.baseX = adjustedPosition.x;
        selectedCard.baseY = adjustedPosition.y;
      });

      this.updateLines();
      this.cdr.detectChanges();
    };

    const onMouseUp = () => {
      this.selectedCards.forEach((selectedCard) => {
        selectedCard.baseX = this.snapToGrid(selectedCard.baseX);
        selectedCard.baseY = this.snapToGrid(selectedCard.baseY);
      });
      this.updateLines();
      this.cdr.detectChanges();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  handleResize(event: MouseEvent, card: Card): void {
    const direction = this.getResizeDirection(card, event);
    if (!direction) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const initialWidth = card.baseWidth;
    const initialHeight = card.baseHeight;
    const initialX = card.baseX;
    const initialY = card.baseY;

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - startX) / this.scale;
      const deltaY = (e.clientY - startY) / this.scale;
      let newWidth = initialWidth;
      let newHeight = initialHeight;
      let newX = initialX;
      let newY = initialY;

      switch (direction) {
        case 'top':
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'bottom':
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          break;
        case 'left':
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newX = initialX + (initialWidth - newWidth);
          break;
        case 'right':
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          break;
        case 'top-left':
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newX = initialX + (initialWidth - newWidth);
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'top-right':
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'bottom-left':
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newX = initialX + (initialWidth - newWidth);
          break;
        case 'bottom-right':
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          break;
      }

      card.baseWidth = newWidth;
      card.baseHeight = newHeight;
      card.baseX = newX;
      card.baseY = newY;
      this.updateLines();
      this.cdr.detectChanges();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  isResizingEdge(card: Card, event: MouseEvent): boolean {
    const rect = this.getCardRect(card);
    const edgeSize = this.borderWidth * this.scale;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const leftEdge = -edgeSize;
    const rightEdge = rect.width + edgeSize;
    const topEdge = -edgeSize;
    const bottomEdge = rect.height + edgeSize;

    return (
      (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) ||
      (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) ||
      (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) ||
      (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) ||
      (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) ||
      (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) ||
      (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) ||
      (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge)
    );
  }

  getResizeDirection(card: Card, event: MouseEvent): string | null {
    const rect = this.getCardRect(card);
    const edgeSize = this.borderWidth * this.scale;

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const leftEdge = -edgeSize;
    const rightEdge = rect.width + edgeSize;
    const topEdge = -edgeSize;
    const bottomEdge = rect.height + edgeSize;

    if (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) return 'top';
    if (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) return 'bottom';
    if (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) return 'left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) return 'right';
    if (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) return 'top-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) return 'top-right';
    if (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-right';
    return null;
  }

  preventOverlap(movingCard: Card, proposedX: number, proposedY: number): { x: number; y: number } {
    const movingRect = {
      left: proposedX * this.scale, // Учитываем масштаб
      top: proposedY * this.scale,
      right: (proposedX + movingCard.baseWidth) * this.scale,
      bottom: (proposedY + movingCard.baseHeight) * this.scale,
    };

    let adjustedX = proposedX;
    let adjustedY = proposedY;

    for (let otherCard of this.cards) {
      if (otherCard === movingCard || this.selectedCards.includes(otherCard)) continue;

      const otherRect = {
        left: otherCard.baseX * this.scale, // Учитываем масштаб
        top: otherCard.baseY * this.scale,
        right: (otherCard.baseX + otherCard.baseWidth) * this.scale,
        bottom: (otherCard.baseY + otherCard.baseHeight) * this.scale,
      };

      if (
        movingRect.left < otherRect.right &&
        movingRect.right > otherRect.left &&
        movingRect.top < otherRect.bottom &&
        movingRect.bottom > otherRect.top
      ) {
        const dxLeft = otherRect.right - movingRect.left;
        const dxRight = movingRect.right - otherRect.left;
        const dyTop = otherRect.bottom - movingRect.top;
        const dyBottom = movingRect.bottom - otherRect.top;

        const minDisplacement = Math.min(Math.abs(dxLeft), Math.abs(dxRight), Math.abs(dyTop), Math.abs(dyBottom));

        // Корректируем позиции с учётом масштаба
        if (minDisplacement === Math.abs(dxLeft)) {
          adjustedX = (otherRect.right / this.scale) + this.gridSpacing * this.scale; // Добавляем шаг сетки
        } else if (minDisplacement === Math.abs(dxRight)) {
          adjustedX = (otherRect.left - movingCard.baseWidth) / this.scale - this.gridSpacing * this.scale; // Уменьшаем на шаг сетки
        } else if (minDisplacement === Math.abs(dyTop)) {
          adjustedY = (otherRect.bottom / this.scale) + this.gridSpacing * this.scale;
        } else if (minDisplacement === Math.abs(dyBottom)) {
          adjustedY = (otherRect.top - movingCard.baseHeight) / this.scale - this.gridSpacing * this.scale;
        }
      }
    }

    // Привязываем к сетке после корректировки
    adjustedX = this.snapToGrid(adjustedX);
    adjustedY = this.snapToGrid(adjustedY);

    return { x: adjustedX, y: adjustedY };
  }

  onCardClick(event: MouseEvent, card: Card): void {
    if (event.altKey && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault();
      if (!this.connectingFrom) {
        this.connectingFrom = card;
      } else if (this.connectingFrom === card) {
        this.connectingFrom = null;
      } else {
        const existingConnectorIndex = this.connectors.findIndex(
          (c) => (c.from === this.connectingFrom && c.to === card) || (c.from === card && c.to === this.connectingFrom)
        );

        if (existingConnectorIndex !== -1) {
          const connector = this.connectors[existingConnectorIndex];
          this.svgContainer.nativeElement.removeChild(connector.path);
          this.connectors.splice(existingConnectorIndex, 1);
        } else {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke', 'white');
          path.setAttribute('stroke-width', (2 * this.scale).toString());
          path.setAttribute('fill', 'none');
          this.svgContainer.nativeElement.appendChild(path);
          this.connectors.push({ from: this.connectingFrom, to: card, path });
          this.updateLines();
        }
        this.connectingFrom = null;
      }
      this.cdr.detectChanges();
    }
  }

  getCardRect(card: Card): DOMRect {
    const el = this.zoomContainer.nativeElement.querySelector(`#${card.id}`);
    return el ? el.getBoundingClientRect() : new DOMRect(card.baseX * this.scale, card.baseY * this.scale, card.baseWidth * this.scale, card.baseHeight * this.scale);
  }

  selectCard(card: Card): void {
    if (!this.connectingFrom || this.connectingFrom !== card) {
      if (!this.selectedCards.includes(card)) {
        this.selectedCards.push(card);
      }
      this.cdr.detectChanges();
    }
  }

  clearSelection(): void {
    this.selectedCards = this.selectedCards.filter((card) => this.connectingFrom === card);
    this.cdr.detectChanges();
  }

  startSelection(event: MouseEvent): void {
    if (event.target === this.zoomContainer.nativeElement && !event.altKey) {
      this.isSelecting = true;
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect();
      this.startX = event.clientX - containerRect.left;
      this.startY = event.clientY - containerRect.top;
      if (!(event.ctrlKey || event.shiftKey)) {
        this.clearSelection();
      }
      this.selectionRect = { left: this.startX, top: this.startY, width: 0, height: 0 };
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isSelecting) {
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect();
      const currentX = event.clientX - containerRect.left;
      const currentY = event.clientY - containerRect.top;

      this.selectionRect = {
        left: Math.min(this.startX, currentX),
        top: Math.min(this.startY, currentY),
        width: Math.abs(currentX - this.startX),
        height: Math.abs(currentY - this.startY),
      };

      const rect = {
        left: this.selectionRect.left + containerRect.left,
        top: this.selectionRect.top + containerRect.top,
        right: this.selectionRect.left + this.selectionRect.width + containerRect.left,
        bottom: this.selectionRect.top + this.selectionRect.height + containerRect.top,
      };

      this.cards.forEach((card) => {
        const cardRect = this.getCardRect(card);
        const isInside =
          cardRect.left < rect.right &&
          cardRect.right > rect.left &&
          cardRect.top < rect.bottom &&
          cardRect.bottom > rect.top;
        if (isInside && !this.selectedCards.includes(card)) {
          this.selectCard(card);
        } else if (!isInside && this.selectedCards.includes(card) && this.connectingFrom !== card && !(event.ctrlKey || event.shiftKey)) {
          this.selectedCards = this.selectedCards.filter((c) => c !== card);
        }
      });
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isSelecting) {
      this.isSelecting = false;
      this.cdr.detectChanges();
    }
  }

  @HostListener('window:wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
      this.zoom(event.deltaY > 0 ? 0.9 : 1.1);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && (event.key === 'c' || event.key === 'с')) {
      event.preventDefault();
      this.copyCards();
    } else if (event.ctrlKey && (event.key === 'v' || event.key === 'м')) {
      event.preventDefault();
      this.pasteCards();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      this.deleteSelectedCards();
    }
  }

  copyCards(): void {
    if (this.selectedCards.length === 0) return;
    this.clipboard = this.selectedCards.map((card) => ({
      baseX: card.baseX / this.scale,
      baseY: card.baseY / this.scale,
      baseWidth: card.baseWidth / this.scale,
      baseHeight: card.baseHeight / this.scale,
      title: card.title,
      inputValue: card.inputValue,
      connections: this.connectors.filter((c) => c.from === card || c.to === card).map((c) => ({
        fromId: c.from.id,
        toId: c.to.id,
      })),
    }));
  }

  pasteCards(): void {
    if (this.clipboard.length === 0) return;

    const newCardsMap = new Map<string, Card>();
    const offsetX = 20 / this.scale;
    const offsetY = 20 / this.scale;

    this.clearSelection();

    this.clipboard.forEach((item) => {
      this.cardCount++;
      const newCard: Card = {
        id: `card${this.cardCount}`,
        title: item.title,
        inputValue: item.inputValue,
        baseX: (item.baseX + offsetX) * this.scale,
        baseY: (item.baseY + offsetY) * this.scale,
        baseWidth: item.baseWidth * this.scale,
        baseHeight: item.baseHeight * this.scale,
      };
      this.cards.push(newCard);
      newCardsMap.set(item.title, newCard);
      this.selectCard(newCard);
    });

    this.clipboard.forEach((item) => {
      item.connections.forEach((conn: { fromId: string; toId: string }) => {
        const fromCard = newCardsMap.get(conn.fromId.replace('card', 'Card '));
        const toCard = newCardsMap.get(conn.toId.replace('card', 'Card '));
        if (fromCard && toCard && fromCard !== toCard) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke', 'white');
          path.setAttribute('stroke-width', (2 * this.scale).toString());
          path.setAttribute('fill', 'none');
          this.svgContainer.nativeElement.appendChild(path);
          this.connectors.push({ from: fromCard, to: toCard, path });
        }
      });
    });

    this.preventOverlapsAfterPaste(); // Устраняем перекрытия после вставки
    this.updateLines();
    this.cdr.detectChanges();
  }

  preventOverlapsAfterPaste(): void {
    this.cards.forEach((card) => {
      let proposedX = card.baseX / this.scale;
      let proposedY = card.baseY / this.scale;
      const adjustedPosition = this.preventOverlap(card, proposedX, proposedY);
      card.baseX = adjustedPosition.x * this.scale;
      card.baseY = adjustedPosition.y * this.scale;
    });
  }

  deleteSelectedCards(): void {
    if (this.selectedCards.length === 0) {
      alert('No cards selected for deletion.');
      return;
    }

    if (confirm(`Are you sure you want to delete ${this.selectedCards.length} selected card(s)? This action cannot be undone.`)) {
      this.cards = this.cards.filter((card) => !this.selectedCards.includes(card));
      this.connectors = this.connectors.filter(
        (conn) => !this.selectedCards.includes(conn.from) && !this.selectedCards.includes(conn.to)
      );
      if (this.connectingFrom && this.selectedCards.includes(this.connectingFrom)) {
        this.connectingFrom = null;
      }
      this.selectedCards = [];
      this.updateLines();
      this.cdr.detectChanges();
    }
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.cdr.detectChanges();
  }

  updateCursor(event: MouseEvent, card: Card): void {
    if (event.altKey || event.target instanceof HTMLInputElement) {
      (event.currentTarget as HTMLElement).style.cursor = 'grab';
      return;
    }
    const direction = this.getResizeDirection(card, event);
    switch (direction) {
      case 'top':
      case 'bottom':
        (event.currentTarget as HTMLElement).style.cursor = 'ns-resize';
        break;
      case 'left':
      case 'right':
        (event.currentTarget as HTMLElement).style.cursor = 'ew-resize';
        break;
      case 'top-left':
      case 'bottom-right':
        (event.currentTarget as HTMLElement).style.cursor = 'nwse-resize';
        break;
      case 'top-right':
      case 'bottom-left':
        (event.currentTarget as HTMLElement).style.cursor = 'nesw-resize';
        break;
      default:
        (event.currentTarget as HTMLElement).style.cursor = 'grab';
    }
  }
}