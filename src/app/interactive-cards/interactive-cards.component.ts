import { CommonModule } from '@angular/common';
// CommonModule provides common Angular directives like ngIf, ngFor, etc.
import { Component, ElementRef, ViewChild, HostListener, AfterViewInit, ChangeDetectorRef } from '@angular/core';
// Component decorator and lifecycle hooks for Angular components, along with DOM manipulation tools.
import { FormsModule } from '@angular/forms';
// FormsModule enables two-way data binding with ngModel for form inputs.

// Interface defining the structure of a card object in the application.
interface Card {
  id: string; // Unique identifier for each card.
  title: string; // Title displayed at the top of the card.
  inputValue: string; // Text entered in the card's input field.
  baseX: number; // Base X-coordinate (unscaled position) of the card.
  baseY: number; // Base Y-coordinate (unscaled position) of the card.
  baseWidth: number; // Base width of the card (unscaled).
  baseHeight: number; // Base height of the card (unscaled).
}

// Interface defining a connection (line) between two cards.
interface Connector {
  from: Card; // Source card of the connection.
  to: Card; // Target card of the connection.
  path: SVGPathElement; // SVG path element representing the line in the DOM.
}

@Component({
  standalone: true, // Indicates this is a standalone component, not part of an NgModule.
  selector: 'app-interactive-cards', // CSS selector for using this component in templates.
  templateUrl: './interactive-cards.component.html', // Path to the HTML template.
  imports: [CommonModule, FormsModule], // Modules required by this component.
  styleUrls: ['./interactive-cards.component.scss'], // Path to the SCSS styles.
})
export class InteractiveCardsComponent implements AfterViewInit {
  // ViewChild decorators to reference DOM elements in the template.
  @ViewChild('zoomContainer') zoomContainer!: ElementRef; // Reference to the zoomable container div.
  @ViewChild('svgContainer') svgContainer!: ElementRef<SVGSVGElement>; // Reference to the SVG element for lines.

  // State variables for the application.
  scale = 1; // Current zoom scale (1 = 100%, ranges from 0.5 to 2).
  cardCount = 0; // Counter for generating unique card IDs.
  cards: Card[] = []; // Array storing all card objects.
  connectors: Connector[] = []; // Array storing all connections (lines) between cards.
  connectingFrom: Card | null = null; // Card currently being connected from (for Alt + click).
  selectedCards: Card[] = []; // Array of currently selected cards.
  clipboard: any[] = []; // Clipboard for copying/pasting cards and their connections.
  isSidebarOpen = false; // Flag indicating if the sidebar is open or closed.
  isSelecting = false; // Flag indicating if a rectangular selection is in progress.
  selectionRect = { left: 0, top: 0, width: 0, height: 0 }; // Rectangular selection area coordinates.
  startX = 0; // Starting X-coordinate for rectangular selection.
  startY = 0; // Starting Y-coordinate for rectangular selection.

  // Configuration constants for the application.
  gridSpacing = 50; // Base grid spacing in pixels (used for snapping positions and sizes).
  readonly baseCardWidth = 250; // Default width of a card in base scale (pixels).
  readonly baseCardPadding = 15; // Default padding inside cards (pixels).
  readonly baseFontSize = 18; // Default font size for card titles (pixels).
  readonly baseInputPadding = 8; // Default padding for input fields in cards (pixels).
  readonly borderWidth = 10; // Width of the resize area around card edges (pixels).

  // Constructor injecting ChangeDetectorRef for manual UI updates.
  constructor(private cdr: ChangeDetectorRef) {}

  // Lifecycle hook called after the view is initialized, setting up initial cards and grid.
  ngAfterViewInit(): void {
    // Initialize the application with two cards at specific positions.
    this.addNewCard(100, 100); // Add Card 1 at (100, 100).
    this.addNewCard(400, 200); // Add Card 2 at (400, 200).
    // Set the initial grid size in CSS for the background pattern.
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing}px`);
    // Trigger Angular change detection to ensure UI updates.
    this.cdr.detectChanges();
  }

  // Method to set a new grid spacing value, with bounds checking.
  setGridSpacing(size: number): void {
    // Ensure gridSpacing is between 10 and 200 pixels.
    this.gridSpacing = Math.max(10, Math.min(200, size));
    // Update the CSS variable for the grid background, scaling with the current zoom.
    this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`);
    // Adjust card positions and sizes to prevent overlaps after grid change.
    this.adjustCardsAfterGridChange();
    // Trigger Angular change detection to update the UI.
    this.cdr.detectChanges();
  }

  // Adjusts all cards' positions and sizes to prevent overlaps after changing grid spacing.
  adjustCardsAfterGridChange(): void {
    this.cards.forEach((card) => {
      // Snap card positions and sizes to the new grid to maintain alignment.
      card.baseX = this.snapToGrid(card.baseX);
      card.baseY = this.snapToGrid(card.baseY);
      card.baseWidth = this.snapToGrid(card.baseWidth);
      card.baseHeight = this.snapToGrid(card.baseHeight);
    });
    // Update connection lines to reflect new positions.
    this.updateLines();
  }

  // Adds a new card at the specified coordinates, snapping to the grid.
  addNewCard(x = 100 / this.scale + this.cardCount * 50 / this.scale, y = 100 / this.scale + this.cardCount * 50 / this.scale): void {
    // Increment the card counter for a unique ID.
    this.cardCount++;
    // Create a new card object with default properties.
    const newCard: Card = {
      id: `card${this.cardCount}`, // Unique ID for the card.
      title: `Card ${this.cardCount}`, // Default title.
      inputValue: '', // Empty input field initially.
      baseX: this.snapToGrid(x), // Snap X position to the grid.
      baseY: this.snapToGrid(y), // Snap Y position to the grid.
      baseWidth: 200, // Default width (pixels).
      baseHeight: 100, // Default height (pixels).
    };
    // Add the new card to the cards array.
    this.cards.push(newCard);
    // Trigger Angular change detection to render the new card.
    this.cdr.detectChanges();
  }

  // Snaps a value to the nearest grid point, accounting for the current scale and grid spacing.
  snapToGrid(value: number): number {
    // Round the value to the nearest multiple of the scaled grid spacing.
    return Math.round(value / (this.gridSpacing * this.scale)) * (this.gridSpacing * this.scale);
  }

  // Zooms in or out by applying a scaling factor, with bounds checking.
  zoom(delta: number): void {
    // Calculate the new scale, ensuring it stays between 0.5 and 2.
    const newScale = this.scale * delta;
    if (newScale >= 0.5 && newScale <= 2) {
      this.scale = newScale;
      // Scale all card positions and sizes proportionally.
      this.cards.forEach((card) => {
        card.baseX = card.baseX * delta; // Scale X position.
        card.baseY = card.baseY * delta; // Scale Y position.
        card.baseWidth = card.baseWidth * delta; // Scale width.
        card.baseHeight = card.baseHeight * delta; // Scale height.
      });
      // Update the grid size in CSS, scaling with the current zoom.
      this.zoomContainer.nativeElement.style.setProperty('--grid-size', `${this.gridSpacing * this.scale}px`);
      // Prevent overlaps after zooming to ensure cards don’t overlap.
      this.preventOverlapsAfterZoom();
      // Update connection lines to reflect new positions and sizes.
      this.updateLines();
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Prevents overlaps among cards after zooming by adjusting their positions.
  preventOverlapsAfterZoom(): void {
    this.cards.forEach((card) => {
      // Get the proposed position (current position after scaling).
      let proposedX = card.baseX;
      let proposedY = card.baseY;
      // Adjust the position to prevent overlaps, using the preventOverlap method.
      const adjustedPosition = this.preventOverlap(card, proposedX, proposedY);
      // Apply the adjusted position to the card.
      card.baseX = adjustedPosition.x;
      card.baseY = adjustedPosition.y;
    });
  }

  // Updates the SVG lines connecting cards based on their current positions and scale.
  updateLines(): void {
    // Clear all existing lines from the SVG to prevent duplicates.
    const svg = this.svgContainer.nativeElement;
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    // Iterate through all connectors (lines between cards).
    this.connectors.forEach((connector) => {
      // Find the source and target cards for this connector.
      const fromCard = this.cards.find((c) => c === connector.from)!;
      const toCard = this.cards.find((c) => c === connector.to)!;
      // Calculate the center points of the cards for the line endpoints.
      const x1 = fromCard.baseX + (fromCard.baseWidth / 2); // Center X of source card.
      const y1 = fromCard.baseY + (fromCard.baseHeight / 2); // Center Y of source card.
      const x2 = toCard.baseX + (toCard.baseWidth / 2); // Center X of target card.
      const y2 = toCard.baseY + (toCard.baseHeight / 2); // Center Y of target card.

      // Calculate the difference in coordinates for curve control points.
      const dx = x2 - x1;
      const dy = y2 - y1;
      // Calculate the distance between the two points for curve scaling.
      const distance = Math.sqrt(dx * dx + dy * dy);
      // Determine the curve factor, limited to a maximum of 150 pixels scaled by zoom.
      const curveFactor = Math.min(distance * 0.3, 150 * this.scale);

      // Calculate control points for a Bezier curve to create a smooth line.
      const cx1 = x1 + dx * 0.25 + (dy > 0 ? curveFactor : -curveFactor); // First control point X.
      const cy1 = y1 + dy * 0.25; // First control point Y.
      const cx2 = x2 - dx * 0.25 + (dy > 0 ? -curveFactor : curveFactor); // Second control point X.
      const cy2 = y2 - dy * 0.25; // Second control point Y.

      // Create a new SVG path element for the connection line.
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      // Set the stroke color to white.
      path.setAttribute('stroke', 'white');
      // Scale the stroke width based on the current zoom level.
      path.setAttribute('stroke-width', (2 * this.scale).toString());
      // Ensure the path is not filled (only a line).
      path.setAttribute('fill', 'none');
      // Define the path as a cubic Bezier curve with the calculated points.
      path.setAttribute('d', `M ${x1 * this.scale} ${y1 * this.scale} C ${cx1 * this.scale} ${cy1 * this.scale}, ${cx2 * this.scale} ${cy2 * this.scale}, ${x2 * this.scale} ${y2 * this.scale}`);
      // Add the path to the SVG container.
      svg.appendChild(path);
      // Store the path element in the connector object.
      connector.path = path;
    });
  }

  // Handles mouse down events on cards, determining drag, resize, or connection actions.
  onCardMouseDown(event: MouseEvent, card: Card): void {
    // Ignore clicks on input fields.
    if (event.target instanceof HTMLInputElement) return;
    // Proceed only if Alt key is not pressed (Alt is for connections).
    if (!event.altKey) {
      // Check if the click is on a resize edge.
      const isResizing = this.isResizingEdge(card, event);
      if (isResizing) {
        // Handle resizing if the click is on an edge.
        this.handleResize(event, card);
      } else {
        // Handle card selection and dragging.
        if (event.ctrlKey || event.shiftKey) {
          // Add or remove the card from selection with Ctrl or Shift.
          if (this.selectedCards.includes(card)) {
            // Remove the card from selection if already selected.
            this.selectedCards = this.selectedCards.filter((c) => c !== card);
          } else {
            // Add the card to selection if not already selected.
            this.selectCard(card);
          }
        } else {
          // Normal behavior: switch selection to the clicked card if not already selected.
          if (!this.selectedCards.includes(card)) {
            this.clearSelection(); // Clear existing selections.
            this.selectCard(card); // Select the clicked card.
          }
        }
        // Start dragging only if the card is currently selected.
        if (this.selectedCards.includes(card)) {
          this.handleDrag(event, card);
        }
      }
      // Prevent default browser behavior (e.g., text selection).
      event.preventDefault();
    }
  }

  // Handles dragging of selected cards.
  handleDrag(event: MouseEvent, card: Card): void {
    // Calculate offsets for all selected cards relative to the click position.
    const offsets = this.selectedCards.map((selectedCard) => ({
      card: selectedCard, // The card being dragged.
      offsetX: event.clientX - selectedCard.baseX * this.scale, // X offset from click to card position.
      offsetY: event.clientY - selectedCard.baseY * this.scale, // Y offset from click to card position.
    }));

    // Define the mouse move handler for dragging.
    const onMouseMove = (e: MouseEvent) => {
      // Update positions for all selected cards.
      offsets.forEach(({ card: selectedCard, offsetX, offsetY }) => {
        // Calculate new positions based on mouse movement, scaled appropriately.
        const newX = (e.clientX - offsetX) / this.scale;
        const newY = (e.clientY - offsetY) / this.scale;
        // Adjust position to prevent overlaps.
        const adjustedPosition = this.preventOverlap(selectedCard, newX, newY);
        // Apply the adjusted position to the card.
        selectedCard.baseX = adjustedPosition.x;
        selectedCard.baseY = adjustedPosition.y;
      });

      // Update connection lines to reflect new card positions.
      this.updateLines();
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    };

    // Define the mouse up handler to finalize dragging.
    const onMouseUp = () => {
      // Snap all selected cards to the grid after dragging.
      this.selectedCards.forEach((selectedCard) => {
        selectedCard.baseX = this.snapToGrid(selectedCard.baseX);
        selectedCard.baseY = this.snapToGrid(selectedCard.baseY);
      });
      // Update connection lines after snapping.
      this.updateLines();
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
      // Remove event listeners to stop dragging.
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    // Add event listeners for dragging.
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Handles resizing of a card by dragging its edges, snapping to the grid.
  handleResize(event: MouseEvent, card: Card): void {
    // Determine the direction of resizing (e.g., top, bottom, left, right, corners).
    const direction = this.getResizeDirection(card, event);
    if (!direction) return; // Exit if not on a resizable edge.

    // Capture initial click coordinates and card dimensions.
    const startX = event.clientX; // Initial X position of the mouse.
    const startY = event.clientY; // Initial Y position of the mouse.
    const initialWidth = card.baseWidth; // Initial width of the card.
    const initialHeight = card.baseHeight; // Initial height of the card.
    const initialX = card.baseX; // Initial X position of the card.
    const initialY = card.baseY; // Initial Y position of the card.

    // Define the mouse move handler for resizing.
    const onMouseMove = (e: MouseEvent) => {
      // Calculate the change in mouse position, scaled by the current zoom.
      const deltaX = (e.clientX - startX) / this.scale;
      const deltaY = (e.clientY - startY) / this.scale;
      let newWidth = initialWidth; // New width to be calculated.
      let newHeight = initialHeight; // New height to be calculated.
      let newX = initialX; // New X position to be calculated.
      let newY = initialY; // New Y position to be calculated.

      // Adjust dimensions and positions based on the resize direction.
      switch (direction) {
        case 'top':
          // Resize from the top, maintaining a minimum height of 50 pixels (scaled).
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          // Snap the height to the grid, scaled by the current zoom.
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          // Adjust Y position to accommodate the new height.
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'bottom':
          // Resize from the bottom, maintaining a minimum height of 50 pixels (scaled).
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          // Snap the height to the grid, scaled by the current zoom.
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          break;
        case 'left':
          // Resize from the left, maintaining a minimum width of 100 pixels (scaled).
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          // Snap the width to the grid, scaled by the current zoom.
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          // Adjust X position to accommodate the new width.
          newX = initialX + (initialWidth - newWidth);
          break;
        case 'right':
          // Resize from the right, maintaining a minimum width of 100 pixels (scaled).
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          // Snap the width to the grid, scaled by the current zoom.
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          break;
        case 'top-left':
          // Resize from the top-left corner, maintaining minimum dimensions.
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newX = initialX + (initialWidth - newWidth);
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'top-right':
          // Resize from the top-right corner, maintaining minimum dimensions.
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight - deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newY = initialY + (initialHeight - newHeight);
          break;
        case 'bottom-left':
          // Resize from the bottom-left corner, maintaining minimum dimensions.
          newWidth = Math.max(100 / this.scale, initialWidth - deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          newX = initialX + (initialWidth - newWidth);
          break;
        case 'bottom-right':
          // Resize from the bottom-right corner, maintaining minimum dimensions.
          newWidth = Math.max(100 / this.scale, initialWidth + deltaX);
          newWidth = this.snapToGrid(newWidth * this.scale) / this.scale;
          newHeight = Math.max(50 / this.scale, initialHeight + deltaY);
          newHeight = this.snapToGrid(newHeight * this.scale) / this.scale;
          break;
      }

      // Apply the new dimensions and positions to the card.
      card.baseWidth = newWidth;
      card.baseHeight = newHeight;
      card.baseX = newX;
      card.baseY = newY;
      // Update connection lines to reflect new card dimensions and positions.
      this.updateLines();
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    };

    // Define the mouse up handler to finalize resizing.
    const onMouseUp = () => {
      // Remove event listeners to stop resizing.
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    // Add event listeners for resizing.
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Checks if the mouse is near a resizable edge of the card.
  isResizingEdge(card: Card, event: MouseEvent): boolean {
    // Get the bounding rectangle of the card in the viewport.
    const rect = this.getCardRect(card);
    // Calculate the edge size for resizing, scaled by the current zoom.
    const edgeSize = this.borderWidth * this.scale;

    // Calculate mouse position relative to the card's top-left corner.
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Define edge boundaries, including an additional area outside the card for resizing.
    const leftEdge = -edgeSize;
    const rightEdge = rect.width + edgeSize;
    const topEdge = -edgeSize;
    const bottomEdge = rect.height + edgeSize;

    // Check if the mouse is within any of the resizable areas (edges or corners).
    return (
      (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) || // Top edge
      (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) || // Bottom edge
      (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) || // Left edge
      (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) || // Right edge
      (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) || // Top-left corner
      (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) || // Top-right corner
      (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) || // Bottom-left corner
      (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge) // Bottom-right corner
    );
  }

  // Determines the direction of resizing based on mouse position relative to the card.
  getResizeDirection(card: Card, event: MouseEvent): string | null {
    // Get the bounding rectangle of the card in the viewport.
    const rect = this.getCardRect(card);
    // Calculate the edge size for resizing, scaled by the current zoom.
    const edgeSize = this.borderWidth * this.scale;

    // Calculate mouse position relative to the card's top-left corner.
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Define edge boundaries, including an additional area outside the card for resizing.
    const leftEdge = -edgeSize;
    const rightEdge = rect.width + edgeSize;
    const topEdge = -edgeSize;
    const bottomEdge = rect.height + edgeSize;

    // Determine the resize direction based on mouse position.
    if (y >= topEdge && y <= edgeSize && x > edgeSize && x < rect.width - edgeSize) return 'top';
    if (y >= rect.height - edgeSize && y <= bottomEdge && x > edgeSize && x < rect.width - edgeSize) return 'bottom';
    if (x >= leftEdge && x <= edgeSize && y > edgeSize && y < rect.height - edgeSize) return 'left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y > edgeSize && y < rect.height - edgeSize) return 'right';
    if (x >= leftEdge && x <= edgeSize && y >= topEdge && y <= edgeSize) return 'top-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= topEdge && y <= edgeSize) return 'top-right';
    if (x >= leftEdge && x <= edgeSize && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-left';
    if (x >= rect.width - edgeSize && x <= rightEdge && y >= rect.height - edgeSize && y <= bottomEdge) return 'bottom-right';
    return null; // No resize direction if not on an edge or corner.
  }

  // Prevents cards from overlapping by adjusting their positions.
  preventOverlap(movingCard: Card, proposedX: number, proposedY: number): { x: number; y: number } {
    // Define the moving card's rectangle, scaled by the current zoom.
    const movingRect = {
      left: proposedX * this.scale, // Left edge of the moving card, scaled.
      top: proposedY * this.scale, // Top edge of the moving card, scaled.
      right: (proposedX + movingCard.baseWidth) * this.scale, // Right edge, scaled.
      bottom: (proposedY + movingCard.baseHeight) * this.scale, // Bottom edge, scaled.
    };

    // Initialize adjusted positions with proposed values.
    let adjustedX = proposedX;
    let adjustedY = proposedY;

    // Check for overlaps with other cards.
    for (let otherCard of this.cards) {
      // Skip the moving card and any selected cards to avoid self-interference.
      if (otherCard === movingCard || this.selectedCards.includes(otherCard)) continue;

      // Define the other card's rectangle, scaled by the current zoom.
      const otherRect = {
        left: otherCard.baseX * this.scale, // Left edge of the other card, scaled.
        top: otherCard.baseY * this.scale, // Top edge of the other card, scaled.
        right: (otherCard.baseX + otherCard.baseWidth) * this.scale, // Right edge, scaled.
        bottom: (otherCard.baseY + otherCard.baseHeight) * this.scale, // Bottom edge, scaled.
      };

      // Check if the moving card overlaps with the other card.
      if (
        movingRect.left < otherRect.right &&
        movingRect.right > otherRect.left &&
        movingRect.top < otherRect.bottom &&
        movingRect.bottom > otherRect.top
      ) {
        // Calculate potential displacements to resolve the overlap.
        const dxLeft = otherRect.right - movingRect.left; // Displacement to move right.
        const dxRight = movingRect.right - otherRect.left; // Displacement to move left.
        const dyTop = otherRect.bottom - movingRect.top; // Displacement to move down.
        const dyBottom = movingRect.bottom - otherRect.top; // Displacement to move up.

        // Find the smallest displacement needed to resolve the overlap.
        const minDisplacement = Math.min(Math.abs(dxLeft), Math.abs(dxRight), Math.abs(dyTop), Math.abs(dyBottom));

        // Adjust the position to prevent overlap, using the smallest displacement.
        if (minDisplacement === Math.abs(dxLeft)) {
          // Move right by adding the grid spacing to ensure proper separation.
          adjustedX = (otherRect.right / this.scale) + this.gridSpacing * this.scale;
        } else if (minDisplacement === Math.abs(dxRight)) {
          // Move left by subtracting the grid spacing to ensure proper separation.
          adjustedX = (otherRect.left - movingCard.baseWidth) / this.scale - this.gridSpacing * this.scale;
        } else if (minDisplacement === Math.abs(dyTop)) {
          // Move down by adding the grid spacing.
          adjustedY = (otherRect.bottom / this.scale) + this.gridSpacing * this.scale;
        } else if (minDisplacement === Math.abs(dyBottom)) {
          // Move up by subtracting the grid spacing.
          adjustedY = (otherRect.top - movingCard.baseHeight) / this.scale - this.gridSpacing * this.scale;
        }
      }
    }

    // Snap the adjusted positions to the grid to maintain alignment.
    adjustedX = this.snapToGrid(adjustedX);
    adjustedY = this.snapToGrid(adjustedY);

    // Return the adjusted position to prevent overlap.
    return { x: adjustedX, y: adjustedY };
  }

  // Handles clicks on cards to create or remove connections using Alt + click.
  onCardClick(event: MouseEvent, card: Card): void {
    // Proceed only if Alt key is pressed and the target is not an input field.
    if (event.altKey && !(event.target instanceof HTMLInputElement)) {
      event.preventDefault(); // Prevent default browser behavior.
      if (!this.connectingFrom) {
        // Start a new connection from this card.
        this.connectingFrom = card;
      } else if (this.connectingFrom === card) {
        // Cancel the connection if clicking the same card again.
        this.connectingFrom = null;
      } else {
        // Check if a connection already exists between the cards.
        const existingConnectorIndex = this.connectors.findIndex(
          (c) => (c.from === this.connectingFrom && c.to === card) || (c.from === card && c.to === this.connectingFrom)
        );

        if (existingConnectorIndex !== -1) {
          // Remove the existing connection if it exists.
          const connector = this.connectors[existingConnectorIndex];
          this.svgContainer.nativeElement.removeChild(connector.path);
          this.connectors.splice(existingConnectorIndex, 1);
        } else {
          // Create a new connection between the cards.
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke', 'white'); // Set line color to white.
          path.setAttribute('stroke-width', (2 * this.scale).toString()); // Scale line thickness with zoom.
          path.setAttribute('fill', 'none'); // Ensure no fill, only a line.
          this.svgContainer.nativeElement.appendChild(path); // Add the path to the SVG.
          this.connectors.push({ from: this.connectingFrom, to: card, path }); // Store the connection.
          this.updateLines(); // Update all lines to reflect the new connection.
        }
        // Clear the connectingFrom state after creating/removing a connection.
        this.connectingFrom = null;
      }
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Gets the bounding rectangle of a card in the viewport, or calculates it if not in DOM.
  getCardRect(card: Card): DOMRect {
    // Try to find the card element in the DOM by its ID.
    const el = this.zoomContainer.nativeElement.querySelector(`#${card.id}`);
    // Return the DOM rectangle if the element exists, otherwise calculate a virtual one.
    return el ? el.getBoundingClientRect() : new DOMRect(card.baseX * this.scale, card.baseY * this.scale, card.baseWidth * this.scale, card.baseHeight * this.scale);
  }

  // Selects a card, adding it to the selectedCards array if not already selected.
  selectCard(card: Card): void {
    // Only select if not currently connecting and the card isn’t the connecting source.
    if (!this.connectingFrom || this.connectingFrom !== card) {
      if (!this.selectedCards.includes(card)) {
        // Add the card to the selection if it’s not already selected.
        this.selectedCards.push(card);
      }
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Clears the current selection of cards, preserving connectingFrom if applicable.
  clearSelection(): void {
    // Filter out all cards except those involved in a connection (if any).
    this.selectedCards = this.selectedCards.filter((card) => this.connectingFrom === card);
    // Trigger Angular change detection to update the UI.
    this.cdr.detectChanges();
  }

  // Starts a rectangular selection when clicking on the container.
  startSelection(event: MouseEvent): void {
    // Proceed only if the click is on the container and Alt key is not pressed.
    if (event.target === this.zoomContainer.nativeElement && !event.altKey) {
      this.isSelecting = true; // Set the selection flag to true.
      // Get the container's position in the viewport.
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect();
      // Calculate starting coordinates relative to the container, not the window.
      this.startX = event.clientX - containerRect.left;
      this.startY = event.clientY - containerRect.top;
      // Clear selection unless Ctrl or Shift is pressed (for additive selection).
      if (!(event.ctrlKey || event.shiftKey)) {
        this.clearSelection();
      }
      // Initialize the selection rectangle at the starting point.
      this.selectionRect = { left: this.startX, top: this.startY, width: 0, height: 0 };
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Handles mouse movement during rectangular selection, updating the selection area and selected cards.
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    // Proceed only if a selection is in progress.
    if (this.isSelecting) {
      // Get the container's position in the viewport to normalize mouse coordinates.
      const containerRect = this.zoomContainer.nativeElement.getBoundingClientRect();
      // Calculate current mouse position relative to the container.
      const currentX = event.clientX - containerRect.left;
      const currentY = event.clientY - containerRect.top;

      // Update the selection rectangle based on the starting and current positions.
      this.selectionRect = {
        left: Math.min(this.startX, currentX), // Left edge of the selection rectangle.
        top: Math.min(this.startY, currentY), // Top edge of the selection rectangle.
        width: Math.abs(currentX - this.startX), // Width of the selection rectangle.
        height: Math.abs(currentY - this.startY), // Height of the selection rectangle.
      };

      // Define the selection area in screen coordinates for intersection checks.
      const rect = {
        left: this.selectionRect.left + containerRect.left, // Convert to screen coordinates.
        top: this.selectionRect.top + containerRect.top,
        right: this.selectionRect.left + this.selectionRect.width + containerRect.left,
        bottom: this.selectionRect.top + this.selectionRect.height + containerRect.top,
      };

      // Check each card to see if it intersects with the selection rectangle.
      this.cards.forEach((card) => {
        // Get the card's bounding rectangle in screen coordinates.
        const cardRect = this.getCardRect(card);
        // Check if the card is inside the selection rectangle.
        const isInside =
          cardRect.left < rect.right && // Card's left edge is left of the right edge of selection.
          cardRect.right > rect.left && // Card's right edge is right of the left edge of selection.
          cardRect.top < rect.bottom && // Card's top edge is above the bottom edge of selection.
          cardRect.bottom > rect.top; // Card's bottom edge is below the top edge of selection.
        // Add the card to selection if it’s inside and not already selected.
        if (isInside && !this.selectedCards.includes(card)) {
          this.selectCard(card);
        }
        // Remove the card from selection if it’s outside and not the connecting source, unless Ctrl/Shift is pressed.
        else if (!isInside && this.selectedCards.includes(card) && this.connectingFrom !== card && !(event.ctrlKey || event.shiftKey)) {
          this.selectedCards = this.selectedCards.filter((c) => c !== card);
        }
      });
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Handles mouse up events to finalize rectangular selection.
  @HostListener('document:mouseup')
  onMouseUp(): void {
    // End the selection process if it’s active.
    if (this.isSelecting) {
      this.isSelecting = false; // Reset the selection flag.
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Handles wheel events for zooming with Ctrl key.
  @HostListener('window:wheel', ['$event'])
  onWheel(event: WheelEvent): void {
    // Proceed only if Ctrl key is pressed.
    if (event.ctrlKey) {
      event.preventDefault(); // Prevent default scrolling behavior.
      // Zoom out if scrolling down, zoom in if scrolling up.
      this.zoom(event.deltaY > 0 ? 0.9 : 1.1);
    }
  }

  // Handles keyboard events for copy, paste, and delete actions.
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Handle copy action (Ctrl+C or Ctrl+С in Cyrillic).
    if (event.ctrlKey && (event.key === 'c' || event.key === 'с')) {
      event.preventDefault(); // Prevent default browser behavior.
      this.copyCards(); // Copy selected cards to clipboard.
    }
    // Handle paste action (Ctrl+V or Ctrl+М in Cyrillic).
    else if (event.ctrlKey && (event.key === 'v' || event.key === 'м')) {
      event.preventDefault(); // Prevent default browser behavior.
      this.pasteCards(); // Paste cards from clipboard.
    }
    // Handle delete action (Delete key).
    else if (event.key === 'Delete') {
      event.preventDefault(); // Prevent default browser behavior.
      this.deleteSelectedCards(); // Delete selected cards with confirmation.
    }
  }

  // Copies the currently selected cards and their connections to the clipboard.
  copyCards(): void {
    // Exit if no cards are selected.
    if (this.selectedCards.length === 0) return;
    // Store the selected cards and their connections in the clipboard, normalizing by scale.
    this.clipboard = this.selectedCards.map((card) => ({
      baseX: card.baseX / this.scale, // Normalize X position by current scale.
      baseY: card.baseY / this.scale, // Normalize Y position by current scale.
      baseWidth: card.baseWidth / this.scale, // Normalize width by current scale.
      baseHeight: card.baseHeight / this.scale, // Normalize height by current scale.
      title: card.title, // Copy the title.
      inputValue: card.inputValue, // Copy the input value.
      connections: this.connectors.filter((c) => c.from === card || c.to === card).map((c) => ({
        fromId: c.from.id, // ID of the source card in the connection.
        toId: c.to.id, // ID of the target card in the connection.
      })),
    }));
  }

  // Pastes cards from the clipboard, adjusting for the current scale and grid.
  pasteCards(): void {
    // Exit if the clipboard is empty.
    if (this.clipboard.length === 0) return;

    // Calculate offset for pasting (scaled by current zoom).
    const offsetX = 20 / this.scale;
    const offsetY = 20 / this.scale;

    // Clear any existing selection.
    this.clearSelection();

    // Map to store new cards for connection restoration.
    const newCardsMap = new Map<string, Card>();

    // Create new cards from clipboard data, scaling and offsetting positions.
    this.clipboard.forEach((item) => {
      this.cardCount++; // Increment the card counter for a unique ID.
      // Create a new card with scaled and offset positions and sizes.
      const newCard: Card = {
        id: `card${this.cardCount}`, // Unique ID for the new card.
        title: item.title, // Use the copied title.
        inputValue: item.inputValue, // Use the copied input value.
        baseX: (item.baseX * this.scale) + offsetX, // Apply current scale and offset for X.
        baseY: (item.baseY * this.scale) + offsetY, // Apply current scale and offset for Y.
        baseWidth: item.baseWidth * this.scale, // Apply current scale for width.
        baseHeight: item.baseHeight * this.scale, // Apply current scale for height.
      };
      // Add the new card to the cards array.
      this.cards.push(newCard);
      // Map the card title to the new card for connection restoration.
      newCardsMap.set(item.title, newCard);
      // Select the new card immediately.
      this.selectCard(newCard);
    });

    // Restore connections for the pasted cards.
    this.clipboard.forEach((item) => {
      item.connections.forEach((conn: { fromId: string; toId: string }) => {
        // Find the source and target cards in the new map.
        const fromCard = newCardsMap.get(conn.fromId.replace('card', 'Card '));
        const toCard = newCardsMap.get(conn.toId.replace('card', 'Card '));
        // Create a connection if both cards exist and are different.
        if (fromCard && toCard && fromCard !== toCard) {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke', 'white'); // Set line color to white.
          path.setAttribute('stroke-width', (2 * this.scale).toString()); // Scale line thickness with zoom.
          path.setAttribute('fill', 'none'); // Ensure no fill, only a line.
          this.svgContainer.nativeElement.appendChild(path); // Add the path to the SVG.
          this.connectors.push({ from: fromCard, to: toCard, path }); // Store the connection.
        }
      });
    });

    // Prevent overlaps after pasting to ensure cards don’t overlap.
    this.preventOverlapsAfterPaste();
    // Update connection lines to reflect new card positions.
    this.updateLines();
    // Trigger Angular change detection to update the UI.
    this.cdr.detectChanges();
  }

  // Prevents overlaps among cards after pasting by adjusting their positions.
  preventOverlapsAfterPaste(): void {
    this.cards.forEach((card) => {
      // Normalize the position to base scale for overlap checking.
      let proposedX = card.baseX / this.scale;
      let proposedY = card.baseY / this.scale;
      // Adjust the position to prevent overlaps.
      const adjustedPosition = this.preventOverlap(card, proposedX, proposedY);
      // Apply the adjusted position, scaling back to current zoom.
      card.baseX = adjustedPosition.x * this.scale;
      card.baseY = adjustedPosition.y * this.scale;
    });
  }

  // Deletes all selected cards with user confirmation.
  deleteSelectedCards(): void {
    // Exit if no cards are selected.
    if (this.selectedCards.length === 0) {
      alert('No cards selected for deletion.'); // Notify the user.
      return;
    }

    // Confirm deletion with the user.
    if (confirm(`Are you sure you want to delete ${this.selectedCards.length} selected card(s)? This action cannot be undone.`)) {
      // Filter out selected cards from the cards array.
      this.cards = this.cards.filter((card) => !this.selectedCards.includes(card));
      // Filter out connections involving selected cards.
      this.connectors = this.connectors.filter(
        (conn) => !this.selectedCards.includes(conn.from) && !this.selectedCards.includes(conn.to)
      );
      // Clear the connectingFrom state if it involves a selected card.
      if (this.connectingFrom && this.selectedCards.includes(this.connectingFrom)) {
        this.connectingFrom = null;
      }
      // Clear the selection.
      this.selectedCards = [];
      // Update connection lines to reflect the changes.
      this.updateLines();
      // Trigger Angular change detection to update the UI.
      this.cdr.detectChanges();
    }
  }

  // Toggles the visibility of the sidebar.
  toggleSidebar(): void {
    // Toggle the sidebar open/closed state.
    this.isSidebarOpen = !this.isSidebarOpen;
    // Trigger Angular change detection to update the UI.
    this.cdr.detectChanges();
  }

  // Updates the cursor style based on mouse position relative to the card for dragging or resizing.
  updateCursor(event: MouseEvent, card: Card): void {
    // Set cursor to grab if Alt key is pressed or target is an input field.
    if (event.altKey || event.target instanceof HTMLInputElement) {
      (event.currentTarget as HTMLElement).style.cursor = 'grab';
      return;
    }
    // Determine the resize direction based on mouse position.
    const direction = this.getResizeDirection(card, event);
    // Set cursor style based on the resize direction or default to grab.
    switch (direction) {
      case 'top':
      case 'bottom':
        (event.currentTarget as HTMLElement).style.cursor = 'ns-resize'; // North-south resize cursor.
        break;
      case 'left':
      case 'right':
        (event.currentTarget as HTMLElement).style.cursor = 'ew-resize'; // East-west resize cursor.
        break;
      case 'top-left':
      case 'bottom-right':
        (event.currentTarget as HTMLElement).style.cursor = 'nwse-resize'; // Northwest-southeast resize cursor.
        break;
      case 'top-right':
      case 'bottom-left':
        (event.currentTarget as HTMLElement).style.cursor = 'nesw-resize'; // Northeast-southwest resize cursor.
        break;
      default:
        (event.currentTarget as HTMLElement).style.cursor = 'grab'; // Default grab cursor for dragging.
    }
  }
}