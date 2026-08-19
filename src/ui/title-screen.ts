import type { Difficulty } from '../ai/difficulty';

export type TitleScreenChoice = { playerSide: 'b' | 'w'; difficulty: Difficulty };

const SIDE_OPTIONS = [
  ['b', 'せんて'],
  ['w', 'ごて'],
] as const;

const DIFFICULTY_OPTIONS = [
  ['weak', 'よわい'],
  ['normal', 'ふつう'],
  ['strong', 'つよい'],
] as const;

export function createTitleScreenElement(
  onStart: (choice: TitleScreenChoice) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'title-screen';

  let selectedSide: 'b' | 'w' = 'b';
  let selectedDifficulty: Difficulty = 'normal';

  const heading = document.createElement('h1');
  heading.textContent = 'しょうぎ どうじょう';

  const sideGroup = document.createElement('div');
  sideGroup.className = 'title-side-select';
  for (const [side, label] of SIDE_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.side = side;
    button.addEventListener('click', () => {
      selectedSide = side;
      updateSelection();
    });
    sideGroup.appendChild(button);
  }

  const difficultyGroup = document.createElement('div');
  difficultyGroup.className = 'title-difficulty-select';
  for (const [difficulty, label] of DIFFICULTY_OPTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.difficulty = difficulty;
    button.addEventListener('click', () => {
      selectedDifficulty = difficulty;
      updateSelection();
    });
    difficultyGroup.appendChild(button);
  }

  function updateSelection(): void {
    for (const button of sideGroup.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('selected', button.dataset.side === selectedSide);
    }
    for (const button of difficultyGroup.querySelectorAll<HTMLButtonElement>('button')) {
      button.classList.toggle('selected', button.dataset.difficulty === selectedDifficulty);
    }
  }
  updateSelection();

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.dataset.action = 'start';
  startButton.textContent = 'たいきょく スタート';
  startButton.addEventListener('click', () => {
    onStart({ playerSide: selectedSide, difficulty: selectedDifficulty });
  });

  el.append(heading, sideGroup, difficultyGroup, startButton);
  return el;
}
