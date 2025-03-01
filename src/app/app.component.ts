import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InteractiveCardsComponent } from './interactive-cards/interactive-cards.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ RouterOutlet, InteractiveCardsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Interactive-cards';
}
