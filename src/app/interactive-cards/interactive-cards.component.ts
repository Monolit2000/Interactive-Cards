import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, HostListener, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Card {
  id: string; // Unique ID for each card.
  title: string; // Card title.
  inputValue: string; // Input field text.
  baseX: number; // Unscaled X position.
  baseY: number; // Unscaled Y position.
  baseWidth: number; // Unscaled width.
  baseHeight: number; // Unscaled height.
}

interface Connector {
  from: Card; // Source card of the connection.
  to: Card; // Target card of the connection.
  path: SVGPathElement; // SVG line element.
}

@Component({
  standalone: true,
  selector: 'app-interactive-cards',
  templateUrl: './interactive-cards.component.html',
  imports: [CommonModule, FormsModule],
  styleUrls: ['./interactive-cards.component.scss'],
})
export class InteractiveCardsComponent implements AfterViewInit {
  @ViewChild('zoomContainer') zoomContainer!: ElementRef; // Zoomable container reference.
  @ViewChild('svgContainer') svgContainer!: ElementRef<SVGSVGElement>; // SVG for lines reference.

  scale = 1; // Zoom level (0.5–2).
  cardCount = 0; // Card ID counter.
  cards: Card[] = []; // List of all cards.
  connectors: Connector[] = []; // List of card connections.
  connectingFrom: Card | null = null; // Card being connected from (Alt + click).
  selectedCards: Card[] = []; // Currently selected cards.
  clipboard: any[] = []; // Clipboard for card copy/paste.
  isSidebarOpen = false; // Sidebar visibility flag.
  isSelecting = false; // Rectangular selection active flag.
  selectionRect = { left: 0, top: 0, width: 0, height: 0 }; // Selection rectangle coordinates.
  startX = 0; // Selection start X.
  startY = 0; // Selection start Y.

  gridSpacing = 50; // Grid spacing in pixels.
  readonly baseCardWidth = 250; // Default card width.
  readonly baseCardPadding = 15; // Card padding.
  readonly baseFontSize = 18; // Card title font size.
  readonly baseInputPadding = 8; // Input field padding.
  readonly borderWidth = 10; // Resize edge width.

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.addNewCard(100, 100); // Initialize with Card 1.
    this.addNewCard(400, 200); // Initialize with Card 2.
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing}px`); // Set initial grid.
    this.cdr.detectChanges(); // Update UI.
  }

  setGridSpacing(size: number): void {
    this.gridSpacing = Math.max(10, Math.min(200, size)); // Limit grid size.
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`); // Update grid with scale.
    this.adjustCardsAfterGridChange(); // Adjust cards to prevent overlaps.
    this.cdr.detectChanges(); // Update UI.
  }

  adjustCardsAfterGridChange(): void {
    this.cards.forEach((card) => {
      card.baseX = this.snapToGrid(card.baseX); // Snap X to grid.
      card.baseY = this.snapToGrid(card.baseY); // Snap Y to grid.
      card.baseWidth = this.snapToGrid(card.baseWidth); // Snap width to grid.
      card.baseHeight = this.snapToGrid(card.baseHeight); // Snap height to grid.
    });
    this.updateLines(); // Update connections.
  }

  addNewCard(x = 100 / this.scale + this.cardCount * 50 / this.scale, y = 100 / this.scale + this.cardCount * 50 / this.scale): void {
    this.cardCount++; // Increment card counter.
    const newCard: Card = {
      id: `card${this.cardCount}`, // Generate unique ID.
      title: `Card ${this.cardCount}`, // Set title.
      inputValue: '', // Empty input.
      baseX: this.snapToGrid(x), // Snap X position.
      baseY: this.snapToGrid(y), // Snap Y position.
      baseWidth: 200, // Default width.
      baseHeight: 100, // Default height.
    };
    this.cards.push(newCard); // Add card to list.
    this.cdr.detectChanges(); // Update UI.
  }

  snapToGrid(value: number): number {
    return Math.round(value / (this.gridSpacing * this.scale)) * (this.gridSpacing * this.scale); // Snap to scaled grid.
  }

  zoom(delta: number): void {
    const newScale = this.scale * delta;
    if (newScale >= 0.5 && newScale <= 2) { // Limit zoom range.
      this.scale = newScale;
      this.cards.forEach((card) => {
        card.baseX *= delta; // Scale X position.
        card.baseY *= delta; // Scale Y position.
        card.baseWidth *= delta; // Scale width.
        card.baseHeight *= delta; // Scale height.
      });
      this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`); // Scale grid.
      this.preventOverlapsAfterZoom(); // Prevent overlaps after zoom.
      this.updateLines(); // Update connections.
      this.cdr.detectChanges(); // Update UI.
    }
  }

  preventOverlapsAfterZoom(): void {
    this.cards.forEach((card) => {
      let proposedX = card.baseX; // Current X position.
      let proposedY = card.baseY; // Current Y position.
      const adjustedPosition = this.preventOverlap(card, proposedX, proposedY); // Adjust to prevent overlaps.
      card.baseX = adjustedPosition.x; // Apply adjusted X.
      card.baseY = adjustedPosition.y; // Apply adjusted Y.
    });
  }

  updateLines(): void {
    const svg = this.svgContainer.nativeElement;
    while (svg.firstChild) svg.removeChild(svg.firstChild); // Clear existing lines.
    this.connectors.forEach((connector) => {
      const fromCard = this.cards.find((c) => c === connector.from)!;
      const toCard = this.cards.find((c) => c === connector.to)!;
      const x1 = fromCard.baseX + (fromCard.baseWidth / 2); // Source center X.
      const y1 = fromCard.baseY + (fromCard.baseHeight / 2); // Source center Y.
      const x2 = toCard.baseX + (toCard.baseWidth / 2); // Target center X.
      const y2 = toCard.baseY + (toCard.baseHeight / 2); // Target center Y.

      const dx = x2 - x1; // X difference.
      const dy = y2 - y1; // Y difference.
      const distance = Math.sqrt(dx * dx + dy * dy); // Distance between points.
      const curveFactor = Math.min(distance * 0.3, 150 * this.scale); // Curve scaling.

      const cx1 = x1 + dx * 0.25 + (dy > 0 ? curveFactor : -curveFactor); // First control point X.
      const cy1 = y1 + dy * 0.25; // First control point Y.
      const cx2 = x2 - dx * 0.25 + (dy > 0 ? -curveFactor : curveFactor); // Second control point X.
      const cy2 = y2 - dy * 0.25; // Second control point Y.

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('stroke', 'white'); // Set line color.
      path.setAttribute('stroke-width', (2 * this.scale).toString()); // Scale line thickness.
      path.setAttribute('fill', 'none'); // No fill, just a line.
      path.setAttribute('d', `M ${x1 * this.scale} ${y1 * this.scale} C ${cx1 * this.scale} ${cy1 * this.scale}, ${cx2 * this.scale} ${cy2 * this.scale}, ${x2 * this.scale} ${y2 * this.scale}`); // Bezier curve path.
      svg.appendChild(path); // Add line to SVG.
      connector.path = path; // Store path in connector.
    });
  }

  onCardMouseDown(event: MouseEvent, card: Card): void {
    if (event.target instanceof HTMLInputElement) return; // Ignore input clicks.
    if (!event.altKey) {
      const isResizing = this.isResizingEdge(card, event); // Check if resizing edge.
      if (isResizing) this.handleResize(event, card); // Handle resize.
      else {
        if (event.ctrlKey || event.shiftKey) { // Additive selection.
          if (this.selectedCards.includes(card)) this.selectedCards = this.selectedCards.filter((c) => c !== card); // Remove from selection.
          else this.selectCard(card); // Add to selection.
        } else if (!this.selectedCards.includes(card)) { // Single selection.
          this.clearSelection(); // Clear previous selection.
          this.selectCard(card); // Select new card.
        }
        if (this.selectedCards.includes(card)) this.handleDrag(event, card); // Start drag if selected.
      }
      event.preventDefault(); // Prevent default behavior.
    }
  }

  handleDrag(event: MouseEvent, card: Card): void {
    const offsets = this.selectedCards.map((selectedCard) => ({
      card: selectedCard, // Dragged card.
      offsetX: event.clientX - selectedCard.baseX * this.scale, // X offset.
      offsetY: event.clientY - selectedCard.baseY * this.scale, // Y offset.
    }));

    const onMouseMove = (e: MouseEvent) => {
      offsets.forEach(({ card, offsetX, offsetY }) => {
        const newX = (e.clientX - offsetX) / this.scale; // New X position.
        const newY = (e.clientY - offsetY) / this.scale; // New Y position.
        const adjustedPosition = this.preventOverlap(card, newX, newY); // Prevent overlaps.
        card.baseX = adjustedPosition.x; // Apply adjusted X.
        card.baseY = adjustedPosition.y; // Apply adjusted Y.
      });
      this.updateLines(); // Update lines.
      this.cdr.detectChanges(); // Update UI.
    };

    const onMouseUp = () => {
      this.selectedCards.forEach((selectedCard) => {
        selectedCard.baseX = this.snapToGrid(selectedCard.baseX); // Snap X to grid.
        selectedCard.baseY = this.snapToGrid(selectedCard.baseY); // Snap Y to grid.
      });
      this.updateLines(); // Update lines after snapping.
      this.cdr.detectChanges(); // Update UI.
      document.removeEventListener('mousemove', onMouseMove); // Stop dragging.
      document.removeEventListener('mouseup', onMouseUp); // Stop dragging.
    };

    document.addEventListener('mousemove', onMouseMove); // Start dragging.
    document.addEventListener('mouseup', onMouseUp); // End dragging.
  }

  handleResize(event: MouseEvent, card: Card): void {
    const direction = this.getResizeDirection(card, event); // Get resize direction.
    if (!direction) return; // Exit if not resizable.

    const startX = event.clientX; // Initial mouse X.
    const startY = event.clientY; // Initial mouse Y.
    const initialWidth = card.baseWidth; // Initial width.
    const initialHeight = card.baseHeight; // Initial height.
    const initialX = card.baseX; // Initial X position.
    const initialY = card.baseY; // Initial Y position.

    const onMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - startX) / this.scale; // X movement, scaled.
      const deltaY = (e.clientY - startY) / this.scale; // Y movement, scaled.
      let newWidth = initialWidth; // New width.
      let newHeight = initialHeight; // New height.
      let newX = initialX; // New X position.
      let newY = initialY; // New Y position.

      switch (direction) {
        case 'top': newHeight = Math.max(50 / this.scale, initialHeight - deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; newY = initialY + (initialHeight - newHeight); break;
        case 'bottom': newHeight = Math.max(50 / this.scale, initialHeight + deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; break;
        case 'left': newWidth = Math.max(100 / this.scale, initialWidth - deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; newX = initialX + (initialWidth - newWidth); break;
        case 'right': newWidth = Math.max(100 / this.scale, initialWidth + deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; break;
        case 'top-left': newWidth = Math.max(100 / this.scale, initialWidth - deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; newHeight = Math.max(50 / this.scale, initialHeight - deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; newX = initialX + (initialWidth - newWidth); newY = initialY + (initialHeight - newHeight); break;
        case 'top-right': newWidth = Math.max(100 / this.scale, initialWidth + deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; newHeight = Math.max(50 / this.scale, initialHeight - deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; newY = initialY + (initialHeight - newHeight); break;
        case 'bottom-left': newWidth = Math.max(100 / this.scale, initialWidth - deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; newHeight = Math.max(50 / this.scale, initialHeight + deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; newX = initialX + (initialWidth - newWidth); break;
        case 'bottom-right': newWidth = Math.max(100 / this.scale, initialWidth + deltaX); newWidth = this.snapToGrid(newWidth * this.scale) / this.scale; newHeight = Math.max(50 / this.scale, initialHeight + deltaY); newHeight = this.snapToGrid(newHeight * this.scale) / this.scale; break;
      }

      card.baseWidth = newWidth; // Set new width.
      card.baseHeight = newHeight; // Set new height.
      card.baseX = newX; // Set new X position.
      card.baseY = newY; // Set new Y position.
      this.updateLines(); // Update lines.
      this.cdr.detectChanges(); // Update UI.
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove); // Stop resizing.
      document.removeEventListener('mouseup', onMouseUp); // Stop resizing.
    };

    document.addEventListener('mousemove', onMouseMove); // Start resizing.
    document.addEventListener('mouseup', onMouseUp); // End resizing.
  }

  isResizingEdge(card: Card, event: MouseEvent): boolean {
    const rect = this.getCardRect(card); // Get card rectangle.
    const edgeSize = this.borderWidth * this.scale; // Scaled edge size for resizing.

    const x = event.clientX - rect.left; // Mouse X relative to card.
    const y = event.clientY - rect.top; // Mouse Y relative to card.

    const leftEdge = -edgeSize; const rightEdge = rect.width + edgeSize; const topEdge = -edgeSize; const bottomEdge = rect.height + edgeSize; // Edge boundaries.

    return (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) || // Top edge.
           (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) || // Bottom edge.
           (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) || // Left edge.
           (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) || // Right edge.
           (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) || // Top-left corner.
           (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) || // Top-right corner.
           (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) || // Bottom-left corner.
           (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge); // Bottom-right corner.
  }

  getResizeDirection(card: Card, event: MouseEvent): string | null {
    const rect = this.getCardRect(card); // Get card rectangle.
    const edgeSize = this.borderWidth * this.scale; // Scaled edge size.

    const x = event.clientX - rect.left; // Mouse X relative to card.
    const y = event.clientY - rect.top; // Mouse Y relative to card.

    const leftEdge = -edgeSize; const rightEdge = rect.width + edgeSize; const topEdge = -edgeSize; const bottomEdge = rect.height + edgeSize; // Edge boundaries.

    if (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) return 'top';
    if (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) return 'bottom';
    if (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) return 'left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) return 'right';
    if (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) return 'top-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) return 'top-right';
    if (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-right';
    return null; // No resize direction if not on edge.
  }

  preventOverlap(movingCard: Card, proposedX: number, proposedY: number): { x: number; y: number } {
    const movingRect = { left: proposedX * this.scale, top: proposedY * this.scale, right: (proposedX + movingCard.baseWidth) * this.scale, bottom: (proposedY + movingCard.baseHeight) * this.scale }; // Scaled moving card rectangle.

    let adjustedX = proposedX; let adjustedY = proposedY; // Initial adjusted positions.

    for (let otherCard of this.cards) {
      if (otherCard === movingCard || this.selectedCards.includes(otherCard)) continue; // Skip moving or selected cards.

      const otherRect = { left: otherCard.baseX * this.scale, top: otherCard.baseY * this.scale, right: (otherCard.baseX + otherCard.baseWidth) * this.scale, bottom: (otherCard.baseY + otherCard.baseHeight) * this.scale }; // Scaled other card rectangle.

      if (movingRect.left < otherRect.right && movingRect.right > otherRect.left && movingRect.top < otherRect.bottom && movingRect.bottom > otherRect.top) { // Check for overlap.
        const dxLeft = otherRect.right - movingRect.left; const dxRight = movingRect.right - otherRect.left; const dyTop = otherRect.bottom - movingRect.top; const dyBottom = movingRect.bottom - otherRect.top; // Calculate displacements.
        const minDisplacement = Math.min(Math.abs(dxLeft), Math.abs(dxRight), Math.abs(dyTop), Math.abs(dyBottom)); // Find smallest displacement.

        if (minDisplacement === Math.abs(dxLeft)) adjustedX = (otherRect.right / this.scale) + this.gridSpacing * this.scale; // Move right by grid step.
        else if (minDisplacement === Math.abs(dxRight)) adjustedX = (otherRect.left - movingCard.baseWidth) / this.scale - this.gridSpacing * this.scale; // Move left by grid step.
        else if (minDisplacement === Math.abs(dyTop)) adjustedY = (otherRect.bottom / this.scale) + this.gridSpacing * this.scale; // Move down by grid step.
        else if (minDisplacement === Math.abs(dyBottom)) adjustedY = (otherRect.top - movingCard.baseHeight) / this.scale - this.gridSpacing * this.scale; // Move up by grid step.
      }
    }

    adjustedX = this.snapToGrid(adjustedX); // Snap X to grid.
    adjustedY = this.snapToGrid(adjustedY); // Snap Y to grid.

    return { x: adjustedX, y: adjustedY }; // Return adjusted position.
  }

  onCardClick(event: MouseEvent, card: Card): void {
    if (event.altKey && !(event.target instanceof HTMLInputElement)) { // Handle Alt + click for connections.
      event.preventDefault();
      if (!this.connectingFrom) this.connectingFrom = card; // Start connection.
      else if (this.connectingFrom === card) this.connectingFrom = null; // Cancel connection.
      else {
        const existingConnectorIndex = this.connectors.findIndex((c) => (c.from === this.connectingFrom && c.to === card) || (c.from === card && c.to === this.connectingFrom)); // Check for existing connection.
        if (existingConnectorIndex !== -1) { // Remove existing connection.
          this.svgContainer.nativeElement.removeChild(this.connectors[existingConnectorIndex].path);
          this.connectors.splice(existingConnectorIndex, 1);
        } else { // Create new connection.
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke', 'white'); path.setAttribute('stroke-width', (2 * this.scale).toString()); path.setAttribute('fill', 'none');
          this.svgContainer.nativeElement.appendChild(path);
          this.connectors.push({ from: this.connectingFrom, to: card, path });
          this.updateLines(); // Update lines.
        }
        this.connectingFrom = null; // Clear connection state.
      }
      this.cdr.detectChanges(); // Update UI.
    }
  }

  getCardRect(card: Card): DOMRect {
    const el = this.zoomContainer.nativeElement.querySelector(`#${card.id}`); // Find card element by ID.
    return el ? el.getBoundingClientRect() : new DOMRect(card.baseX * this.scale, card.baseY * this.scale, card.baseWidth * this.scale, card.baseHeight * this.scale); // Return DOM or virtual rectangle.
  }

  selectCard(card: Card): void {
    if (!this.connectingFrom || this.connectingFrom !== card) { // Avoid selecting during connection.
      if (!this.selectedCards.includes(card)) this.selectedCards.push(card); // Add to selection if not selected.
      this.cdr.detectChanges(); // Update UI.
    }
  }

  clearSelection(): void {
    this.selectedCards = this.selectedCards.filter((card) => this.connectingFrom === card); // Keep only connecting card if any.
    this.cdr.detectChanges(); // Update UI.
  }

  startSelection(event: MouseEvent): void {
    if (event.target === this.zoomContainer.nativeElement && !event.altKey) { // Start selection on container, not Alt pressed.
      this.isSelecting = true; // Activate selection.
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect(); // Get container position.
      this.startX = event.clientX - containerRect.left; // Start X relative to container.
      this.startY = event.clientY - containerRect.top; // Start Y relative to container.
      if (!(event.ctrlKey || event.shiftKey)) this.clearSelection(); // Clear unless additive selection.
      this.selectionRect = { left: this.startX, top: this.startY, width: 0, height: 0 }; // Init selection rect.
      this.cdr.detectChanges(); // Update UI.
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isSelecting) { // Update selection during drag.
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect(); // Get container position.
      const currentX = event.clientX - containerRect.left; // Current X relative to container.
      const currentY = event.clientY - containerRect.top; // Current Y relative to container.

      this.selectionRect = { left: Math.min(this.startX, currentX), top: Math.min(this.startY, currentY), width: Math.abs(currentX - this.startX), height: Math.abs(currentY - this.startY) }; // Update selection rectangle.

      const rect = { left: this.selectionRect.left + containerRect.left, top: this.selectionRect.top + containerRect.top, right: this.selectionRect.left + this.selectionRect.width + containerRect.left, bottom: this.selectionRect.top + this.selectionRect.height + containerRect.top }; // Selection in screen coords.

      this.cards.forEach((card) => {
        const cardRect = this.getCardRect(card); // Get card rectangle.
        const isInside = cardRect.left < rect.right && cardRect.right > rect.left && cardRect.top < rect.bottom && cardRect.bottom > rect.top; // Check if card is in selection.
        if (isInside && !this.selectedCards.includes(card)) this.selectCard(card); // Add to selection if inside.
        else if (!isInside && this.selectedCards.includes(card) && this.connectingFrom !== card && !(event.ctrlKey || event.shiftKey)) this.selectedCards = this.selectedCards.filter((c) => c !== card); // Remove if outside, unless additive.
      });
      this.cdr.detectChanges(); // Update UI.
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isSelecting) { // End selection on mouse up.
      this.isSelecting = false; // Deactivate selection.
      this.cdr.detectChanges(); // Update UI.
    }
  }

  @HostListener('window:wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    if (event.ctrlKey) { // Zoom with Ctrl + wheel.
      event.preventDefault(); // Prevent default scroll.
      this.zoom(event.deltaY > 0 ? 0.9 : 1.1); // Zoom out/in based on scroll direction.
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey && (event.key === 'c' || event.key === 'с')) { // Copy with Ctrl+C/С.
      event.preventDefault(); this.copyCards();
    } else if (event.ctrlKey && (event.key === 'v' || event.key === 'м')) { // Paste with Ctrl+V/М.
      event.preventDefault(); this.pasteCards();
    } else if (event.key === 'Delete') { // Delete selected cards.
      event.preventDefault(); this.deleteSelectedCards();
    }
  }

  copyCards(): void {
    if (this.selectedCards.length === 0) return; // Exit if no selection.
    this.clipboard = this.selectedCards.map((card) => ({ baseX: card.baseX / this.scale, baseY: card.baseY / this.scale, baseWidth: card.baseWidth / this.scale, baseHeight: card.baseHeight / this.scale, title: card.title, inputValue: card.inputValue, connections: this.connectors.filter((c) => c.from === card || c.to === card).map((c) => ({ fromId: c.from.id, toId: c.to.id })) })); // Copy cards and connections, normalized by scale.
  }

  pasteCards(): void {
    if (this.clipboard.length === 0) return; // Exit if clipboard empty.
    const offsetX = 20 / this.scale; const offsetY = 20 / this.scale; // Offset for pasting.
    this.clearSelection(); // Clear current selection.
    const newCardsMap = new Map<string, Card>(); // Map for new cards.
    this.clipboard.forEach((item) => { this.cardCount++; const newCard: Card = { id: `card${this.cardCount}`, title: item.title, inputValue: item.inputValue, baseX: (item.baseX * this.scale) + offsetX, baseY: (item.baseY * this.scale) + offsetY, baseWidth: item.baseWidth * this.scale, baseHeight: item.baseHeight * this.scale }; this.cards.push(newCard); newCardsMap.set(item.title, newCard); this.selectCard(newCard); }); // Create and select new cards.
    this.clipboard.forEach((item) => item.connections.forEach((conn: { fromId: string; toId: string }) => { const fromCard = newCardsMap.get(conn.fromId.replace('card', 'Card ')); const toCard = newCardsMap.get(conn.toId.replace('card', 'Card ')); if (fromCard && toCard && fromCard !== toCard) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('stroke', 'white'); path.setAttribute('stroke-width', (2 * this.scale).toString()); path.setAttribute('fill', 'none'); this.svgContainer.nativeElement.appendChild(path); this.connectors.push({ from: fromCard, to: toCard, path }); } })); // Restore connections.
    this.preventOverlapsAfterPaste(); // Prevent overlaps after paste.
    this.updateLines(); // Update lines.
    this.cdr.detectChanges(); // Update UI.
  }

  preventOverlapsAfterPaste(): void {
    this.cards.forEach((card) => { let proposedX = card.baseX / this.scale; let proposedY = card.baseY / this.scale; const adjustedPosition = this.preventOverlap(card, proposedX, proposedY); card.baseX = adjustedPosition.x * this.scale; card.baseY = adjustedPosition.y * this.scale; }); // Adjust positions to prevent overlaps, scaled.
  }

  deleteSelectedCards(): void {
    if (this.selectedCards.length === 0) { alert('No cards selected for deletion.'); return; } // Notify if no selection.
    if (confirm(`Are you sure you want to delete ${this.selectedCards.length} selected card(s)? This action cannot be undone.`)) { this.cards = this.cards.filter((card) => !this.selectedCards.includes(card)); this.connectors = this.connectors.filter((conn) => !this.selectedCards.includes(conn.from) && !this.selectedCards.includes(conn.to)); if (this.connectingFrom && this.selectedCards.includes(this.connectingFrom)) this.connectingFrom = null; this.selectedCards = []; this.updateLines(); this.cdr.detectChanges(); } // Delete selected cards with confirmation.
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen; // Toggle sidebar visibility.
    this.cdr.detectChanges(); // Update UI.
  }

  updateCursor(event: MouseEvent, card: Card): void {
    if (event.altKey || event.target instanceof HTMLInputElement) (event.currentTarget as HTMLElement).style.cursor = 'grab'; // Set grab cursor for Alt or inputs.
    else { const direction = this.getResizeDirection(card, event); (event.currentTarget as HTMLElement).style.cursor = direction ? { top: 'ns-resize', bottom: 'ns-resize', left: 'ew-resize', right: 'ew-resize', 'top-left': 'nwse-resize', 'bottom-right': 'nwse-resize', 'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize' }[direction] || 'grab' : 'grab'; } // Set resize cursor or default to grab.
  }
}