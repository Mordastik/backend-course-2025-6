import { Command } from 'commander';

// Створення нового об'єкта програми
const program = new Command();

// Налаштування інформації про програму
program
  .name('backend-app')
  .description('A simple backend application for course 2025-6')
  .version('1.0.0');

// Додавання команди
program.command('greet')
  .description('Say hello to a specified person')
  .argument('<name>', 'Name of the person to greet')
  .action((name) => {
    console.log(`Привіт, ${name}! Ласкаво просимо до курсу!`);
  });

// Парсинг аргументів командного рядка
program.parse(process.argv);