// Definicje poziomów. Każdy poziom buduje się z prostopadłościanów przez API `L`
// (patrz LevelAPI w game.js). Biały panel = można stawiać portale, ciemny = nie można.
//
//  L.room(x0, x1, z0, z1, h, {n,s,e,w,ceil})  ściany + sufit + lampy
//  L.floor(x0, x1, z0, z1, kind)               płyta podłogi (y = 0)
//  L.pit(x0, x1, z0, z1)                       dno + kwas (dziurę robią sąsiednie floor())
//  L.box(x0, y0, z0, x1, y1, z1, kind)         dowolna bryła
//
// Wszystkie poziomy zaczynają się przy dodatnim z i patrzą w stronę ujemnego z (yaw = 0).

const DARK_ALL = { n: 'dark', s: 'dark', e: 'dark', w: 'dark', ceil: 'dark' };

// schody 0,5 m na stopień: biegną w stronę -z, kończą się przy zEnd na wysokości `top`
function stairs(L, x0, x1, zEnd, top, depth = 1) {
  const n = Math.round(top / 0.5);
  for (let i = 1; i <= n; i++) L.box(x0, 0, zEnd, x1, 0.5 * i, zEnd + depth * (n - i + 1), 'white');
}

export const LEVELS = [
  {
    name: 'Wysoka półka',
    hint: 'Półka jest za wysoka na skok. Portal wejściowy postaw tam, gdzie stoisz, wyjściowy – tam, gdzie chcesz się znaleźć.',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    exit: { x: 0, y: 6, z: -14 },
    build(L) {
      L.room(-10, 10, -18, 16, 14);
      L.floor(-10, 10, -18, 16);
      L.box(-10, 0, -18, 10, 6, -10, 'white');
    },
  },
  {
    name: 'Kwas',
    hint: 'Kwas zabija. Portal możesz postawić nawet bardzo daleko – o ile widzisz tam białą powierzchnię.',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    exit: { x: 0, y: 0, z: -18 },
    build(L) {
      L.room(-9, 9, -22, 16, 10);
      L.floor(-9, 9, 0, 16);
      L.pit(-9, 9, -14, 0);
      L.floor(-9, 9, -22, -14);
    },
  },
  {
    name: 'Wyspy',
    hint: 'Wyspa pośrodku ma tylko wąski biały pas. Portale można przestawiać w każdej chwili – strzał zastępuje portal tego samego koloru.',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    exit: { x: 0, y: 0, z: -46 },
    build(L) {
      L.room(-8, 8, -50, 16, 10);
      L.floor(-8, 8, 0, 16);
      L.pit(-8, 8, -14, 0);
      L.floor(-8, -3, -22, -14, 'dark');
      L.floor(-3, 3, -22, -14, 'floor');
      L.floor(3, 8, -22, -14, 'dark');
      L.pit(-8, 8, -36, -22);
      L.floor(-8, 8, -50, -36);
    },
  },
  {
    name: 'Sufit',
    hint: 'Ciemna ściana blokuje drogę, a za nią wszystko jest ciemne. Czy na pewno widzisz stąd tylko ścianę?',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    exit: { x: 0, y: 0, z: -18 },
    build(L) {
      L.room(-10, 10, -26, 16, 16, { n: 'dark', e: 'dark', w: 'dark' });
      L.floor(-10, 10, -4, 16);
      L.floor(-10, 10, -26, -6, 'dark');
      L.box(-10, -8, -6, 10, 7, -4, 'dark');
    },
  },
  {
    name: 'Szczelina',
    hint: 'Jedyne, co widać po drugiej stronie, to szczelina w ciemnej ścianie. Strzał też przez nią przeleci.',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    exit: { x: 0, y: 0, z: -19 },
    build(L) {
      L.room(-10, 10, -24, 16, 16, { e: 'dark', w: 'dark' });
      L.floor(-10, 10, -4, 16);
      L.floor(-10, 10, -24, -6, 'dark');
      L.box(-10, -8, -6, -1.2, 16, -4, 'dark');
      L.box(1.2, -8, -6, 10, 16, -4, 'dark');
      L.box(-1.2, 6.8, -6, 1.2, 16, -4, 'dark');
      L.box(-1.2, -8, -6, 1.2, 2.8, -4, 'dark');
    },
  },
  {
    name: 'Pęd',
    hint: 'Przepaść jest za szeroka, a po drugiej stronie nic nie przyjmie portalu. Wysokość to prędkość – a prędkość portal zachowuje. Zanim wejdziesz na górę, przygotuj sobie wyjście.',
    spawn: { x: 0, y: 0, z: 0, yaw: Math.PI },
    exit: { x: 0, y: 0, z: -26 },
    build(L) {
      L.room(-8, 8, -36, 28, 26, { n: 'dark', ceil: 'dark' });
      L.floor(-8, 8, -4, 6);
      L.floor(-8, -4, 6, 28);
      L.box(-4, 0, 6, 8, 12, 28, 'white');
      for (let i = 1; i <= 24; i++) L.box(-8, 0, 6 + 0.8 * (i - 1), -4, 0.5 * i, 28, 'white');
      L.pit(-8, 8, -14, -4);
      L.floor(-8, 8, -36, -14, 'dark');
    },
  },
  {
    name: 'Winda',
    hint: 'Portal na podłodze i drugi wyżej, na tej samej podłodze… Skacząc w dół, wylecisz z niego wyżej, niż zacząłeś. Oba portale postaw, patrząc w tę samą stronę.',
    spawn: { x: -8, y: 0, z: 15, yaw: 0 },
    exit: { x: 9, y: 8.5, z: 2 },
    build(L) {
      L.room(-12, 16, -6, 16, 16, DARK_ALL);
      L.floor(-12, 16, -6, 16);
      L.box(-12, 0, -6, -4, 4, 6, 'white');
      stairs(L, -12, -4, 6, 4);
      L.box(1, 0, -6, 16, 8.5, 10, 'white');
    },
  },
  {
    name: 'Wieża',
    hint: 'Jeden skok w dół nie wystarczy. Najpierw wejdź tam, gdzie się da – a potem skocz stamtąd jeszcze raz.',
    spawn: { x: -8, y: 0, z: 15, yaw: 0 },
    exit: { x: -18, y: 12.5, z: 0 },
    build(L) {
      L.room(-24, 10, -6, 16, 22, DARK_ALL);
      L.floor(-24, 10, -6, 16);
      L.box(-12, 0, -6, -4, 4, 6, 'white');
      stairs(L, -12, -4, 6, 4);
      L.box(1, 0, -6, 10, 8.5, 10, 'white');
      L.box(-24, 0, -6, -12, 12.5, 6, 'white');
    },
  },
  {
    name: 'Pętla',
    hint: 'Ściana za Tobą jest ogromna, sufit też. Portal w podłodze i drugi nad nim to studnia bez dna – a w locie można przestawić portal.',
    spawn: { x: 0, y: 0, z: 2, yaw: 0 },
    exit: { x: 0, y: 0, z: -50 },
    build(L) {
      L.room(-10, 10, -64, 8, 36, { n: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });
      L.box(-10, 34, -12, 10, 36, 8, 'white');       // biały fragment sufitu nad wejściem
      L.floor(-10, 10, -6, 8);
      L.pit(-10, 10, -34, -6);
      L.floor(-10, 10, -64, -34, 'dark');
    },
  },
  {
    name: 'Finał',
    hint: 'Półka po drugiej stronie jest wysoko i daleko. Liczy się nie tylko prędkość, ale i wysokość, z której wylecisz.',
    spawn: { x: 0, y: 0, z: 2, yaw: 0 },
    exit: { x: 0, y: 8, z: -50 },
    build(L) {
      L.room(-10, 10, -64, 8, 36, { n: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });
      L.box(-10, 34, -12, 10, 36, 8, 'white');
      L.floor(-10, 10, -6, 8);
      L.pit(-10, 10, -40, -6);
      L.box(-10, -8, -64, 10, 8, -40, 'dark');
    },
  },
];
