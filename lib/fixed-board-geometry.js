/* Geometry restored from the pre-integration prototype b7333ac. */
const SIZE = 7;
const RINGSIDE_SIZE = 9;
const BOARD_CENTER_SIZE = RINGSIDE_SIZE;
const corners = [
    { r: 0, c: 0 },
    { r: 0, c: SIZE - 1 },
    { r: SIZE - 1, c: 0 },
    { r: SIZE - 1, c: SIZE - 1 },
];
function isCornerCell(row, column) {
    return corners.some((corner) => corner.r === row && corner.c === column);
}
function isRingsidePerimeter(row, column) {
    return row === 0 || column === 0 || row === RINGSIDE_SIZE - 1 || column === RINGSIDE_SIZE - 1;
}
const TURN_ORDER = ['right-front', 'right-back', 'left-back', 'left-front'];
const SURFACE_TURNS = {
    front: 0,
    right: 1,
    back: 2,
    left: 3,
    top: null,
    bottom: null,
};
const SCREEN_SURFACES = {
    'right-front': {
        edge: 'M42 42 L84 21',
    },
    'right-back': { edge: 'M42 0 L84 21' },
    'left-back': { edge: 'M0 21 L42 0' },
    'left-front': {
        edge: 'M0 21 L42 42',
    },
};
const TOP_SURFACE = { edge: 'M42 0 L84 21' };
const FRONT_EYES = [
    { surface: 'front', u: 0.357, v: 0.321 },
    { surface: 'front', u: 0.619, v: 0.333 },
];
const HIDDEN_RINGSIDE_DESTINATION = {
    area: 'ringside',
    // C1: the far-side mat behind the default B2 red corner.
    row: -1,
    column: 1,
};
const ROPE_THROW_DIRECTIONS = [
    { facing: 'right-back', label: '右奥', row: -1, column: 0, edge: 'top' },
    { facing: 'right-front', label: '右手前', row: 0, column: 1, edge: 'right' },
    { facing: 'left-front', label: '左手前', row: 1, column: 0, edge: 'bottom' },
    { facing: 'left-back', label: '左奥', row: 0, column: -1, edge: 'left' },
];
const INITIAL_WRESTLERS = {
    // D5 and F5: both wrestlers begin near center with E5 between them.
    red: { location: { area: 'ring', row: 3, column: 2 }, facing: 'right-front', stance: 'standing' },
    blue: { location: { area: 'ring', row: 3, column: 4 }, facing: 'left-back', stance: 'standing' },
};
function rotateCell(row, column, size, rotation) {
    let rotatedRow = row;
    let rotatedColumn = column;
    for (let turn = 0; turn < rotation; turn += 1) {
        [rotatedRow, rotatedColumn] = [rotatedColumn, size - 1 - rotatedRow];
    }
    return { row: rotatedRow, column: rotatedColumn };
}
function rotateWorldCell(row, column, rotation) {
    const rotated = rotateCell(row + 1, column + 1, BOARD_CENTER_SIZE, rotation);
    return { row: rotated.row - 1, column: rotated.column - 1 };
}
function boardPosition(location, rotation) {
    const { row, column } = rotateWorldCell(location.row, location.column, rotation);
    // A piece is positioned by its feet, not by the top-left of its cube image.
    // Ring cells begin at 18; the 9×9 ringside floor is one rendered level lower.
    const floorTop = (location.area === 'ringside' ? 60 : 18) + (row + column) * 21;
    const standingLevels = location.area === 'corner' ? 2 : 1;
    const depth = row + column;
    // All solid objects on the ring share the same depth scale. This lets a
    // nearer post cover a farther wrestler, while a nearer wrestler correctly
    // covers a farther post. Height only lifts the token into its own band.
    const zIndex = location.area === 'ringside'
        ? (depth < SIZE - 1 ? 20 + depth : 90 + depth)
        : location.area === 'corner'
            ? 80 + depth
            : 60 + depth;
    return {
        left: `calc(50% + ${(column - row) * 42}px)`,
        top: `${floorTop - standingLevels * 42}px`,
        zIndex,
    };
}
function isSameLocation(left, right) {
    return left.area === right.area && left.row === right.row && left.column === right.column;
}
function otherWrestler(id) {
    return id === 'red' ? 'blue' : 'red';
}
function isAdjacentForRopeThrow(left, right) {
    return left.area === right.area
        && (left.area === 'ring' || left.area === 'ringside')
        && Math.abs(left.row - right.row) + Math.abs(left.column - right.column) === 1;
}
function isMovementAllowedByEngagement(from, to, opponent, stance) {
    const distance = Math.abs(from.row - to.row) + Math.abs(from.column - to.column);
    if (stance === 'down')
        return distance <= 1;
    if (!isAdjacentForRopeThrow(from, opponent))
        return distance <= 2;
    // While engaged, a wrestler may step away by one cell or circle one quarter
    // around the opponent. Crossing directly from front to rear is not allowed.
    if (distance <= 1)
        return true;
    if (!isAdjacentForRopeThrow(to, opponent))
        return false;
    const fromRow = from.row - opponent.row;
    const fromColumn = from.column - opponent.column;
    const toRow = to.row - opponent.row;
    const toColumn = to.column - opponent.column;
    return fromRow * toRow + fromColumn * toColumn === 0;
}
function oppositeFacing(facing) {
    return TURN_ORDER[(TURN_ORDER.indexOf(facing) + 2) % TURN_ORDER.length];
}
function turnFacing(facing, amount) {
    const index = TURN_ORDER.indexOf(facing);
    return TURN_ORDER[(index + amount + TURN_ORDER.length) % TURN_ORDER.length];
}
function facingToward(from, to) {
    const rowDistance = to.row - from.row;
    const columnDistance = to.column - from.column;
    if (Math.abs(columnDistance) > Math.abs(rowDistance)) {
        return columnDistance > 0 ? 'right-front' : 'left-back';
    }
    return rowDistance > 0 ? 'left-front' : 'right-back';
}
function rollD6() {
    return Math.floor(Math.random() * 6) + 1;
}
function locationHeight(location) {
    return location.area === 'ringside' ? 0 : location.area === 'ring' ? 1 : 2;
}
function directionVector(facing) {
    return ROPE_THROW_DIRECTIONS.find((direction) => direction.facing === facing);
}
function forwardDistance(from, to, facing) {
    const vector = directionVector(facing);
    const rowDistance = to.row - from.row;
    const columnDistance = to.column - from.column;
    if (vector.row !== 0 && columnDistance === 0 && rowDistance * vector.row > 0) {
        return Math.abs(rowDistance);
    }
    if (vector.column !== 0 && rowDistance === 0 && columnDistance * vector.column > 0) {
        return Math.abs(columnDistance);
    }
    return null;
}
function cornerTopAttackVector(from, to) {
    if (from.area !== 'corner' || to.area !== 'ring')
        return null;
    const rowDistance = to.row - from.row;
    const columnDistance = to.column - from.column;
    const range = Math.max(Math.abs(rowDistance), Math.abs(columnDistance));
    if (range < 1
        || range > 2
        || (rowDistance === 0 && columnDistance === 0)) {
        return null;
    }
    return { row: Math.sign(rowDistance), column: Math.sign(columnDistance) };
}
function isPlayableLocation(location) {
    if (location.area === 'ring') {
        return location.row >= 0 && location.row < SIZE
            && location.column >= 0 && location.column < SIZE
            && !isCornerCell(location.row, location.column);
    }
    if (location.area === 'corner')
        return isCornerCell(location.row, location.column);
    return location.row >= -1 && location.row <= SIZE
        && location.column >= -1 && location.column <= SIZE
        && (location.row === -1 || location.row === SIZE || location.column === -1 || location.column === SIZE);
}
function locationForWorldCell(row, column) {
    if (row >= 0 && row < SIZE && column >= 0 && column < SIZE && !isCornerCell(row, column)) {
        return { area: 'ring', row, column };
    }
    const ringside = { area: 'ringside', row, column };
    return isPlayableLocation(ringside) ? ringside : null;
}
function randomChoice(items, rng = Math.random) {
    return items[Math.floor(rng() * items.length)];
}
function locationLabel(location) {
    return `${String.fromCharCode(66 + location.column)}${location.row + 2}`;
}
function sameAreaLandingCandidates(center, area, occupied) {
    const candidates = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
            if (rowOffset === 0 && columnOffset === 0)
                continue;
            const candidate = {
                area,
                row: center.row + rowOffset,
                column: center.column + columnOffset,
            };
            if (isPlayableLocation(candidate) && !occupied.some((location) => isSameLocation(location, candidate))) {
                candidates.push(candidate);
            }
        }
    }
    return candidates;
}
function ropeThrowGeometry(attacker, direction, defender) {
    if (attacker.area !== 'ring')
        return null;
    const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction);
    const frontRow = attacker.row + vector.row;
    const frontColumn = attacker.column + vector.column;
    // When the defender is already against the selected rope, the outward throw
    // begins from their square rather than the attacker's square.
    const defenderOutRow = defender?.area === 'ring' ? defender.row + vector.row : null;
    const defenderOutColumn = defender?.area === 'ring' ? defender.column + vector.column : null;
    const defenderFallsOut = defenderOutRow !== null
        && defenderOutColumn !== null
        && (defenderOutRow < 0
            || defenderOutRow >= SIZE
            || defenderOutColumn < 0
            || defenderOutColumn >= SIZE);
    // Throwing outward from a rope-side square sends the defender directly to
    // ringside. There is no return or interception phase after a fall.
    if (defenderFallsOut || frontRow < 0 || frontRow >= SIZE || frontColumn < 0 || frontColumn >= SIZE) {
        return {
            fellOut: true,
            destination: {
                area: 'ringside',
                row: defenderFallsOut ? defenderOutRow : frontRow,
                column: defenderFallsOut ? defenderOutColumn : frontColumn,
            },
            edge: vector.edge,
        };
    }
    const returnLocation = { area: 'ring', row: frontRow, column: frontColumn };
    let ropeRow = frontRow;
    let ropeColumn = frontColumn;
    while (ropeRow + vector.row >= 0
        && ropeRow + vector.row < SIZE
        && ropeColumn + vector.column >= 0
        && ropeColumn + vector.column < SIZE) {
        ropeRow += vector.row;
        ropeColumn += vector.column;
    }
    if (isCornerCell(ropeRow, ropeColumn)) {
        return {
            fellOut: false,
            cornerImpact: true,
            cornerLocation: { area: 'corner', row: ropeRow, column: ropeColumn },
            destination: {
                area: 'ring',
                row: ropeRow - vector.row,
                column: ropeColumn - vector.column,
            },
            edge: vector.edge,
        };
    }
    return {
        fellOut: false,
        cornerImpact: false,
        returnLocation,
        ropeLocation: { area: 'ring', row: ropeRow, column: ropeColumn },
        edge: vector.edge,
    };
}
function ringsideThrowGeometry(attacker, direction) {
    if (attacker.area !== 'ringside')
        return null;
    const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction);
    const nextRow = attacker.row + vector.row;
    const nextColumn = attacker.column + vector.column;
    const cornerImpact = corners.find((corner) => {
        const distance = Math.abs(attacker.row - corner.r) + Math.abs(attacker.column - corner.c);
        const nextDistance = Math.abs(nextRow - corner.r) + Math.abs(nextColumn - corner.c);
        return distance <= 2
            && Math.max(Math.abs(attacker.row - corner.r), Math.abs(attacker.column - corner.c)) === 1
            && nextDistance < distance;
    });
    if (cornerImpact) {
        return { kind: 'corner-impact', corner: cornerImpact };
    }
    if (nextRow >= 0 && nextRow < SIZE && nextColumn >= 0 && nextColumn < SIZE) {
        return {
            kind: 'ring-return',
            destination: { area: 'ring', row: nextRow, column: nextColumn },
        };
    }
    if (nextRow < -1 || nextRow > SIZE || nextColumn < -1 || nextColumn > SIZE) {
        return { kind: 'barrier-impact' };
    }
    let destinationRow = attacker.row;
    let destinationColumn = attacker.column;
    while (destinationRow + vector.row >= -1
        && destinationRow + vector.row <= SIZE
        && destinationColumn + vector.column >= -1
        && destinationColumn + vector.column <= SIZE) {
        destinationRow += vector.row;
        destinationColumn += vector.column;
    }
    return {
        kind: 'barrier-run',
        destination: {
            area: 'ringside',
            row: destinationRow,
            column: destinationColumn,
        },
    };
}
function ropeDirectionTarget(attacker, direction, defender) {
    if (attacker.area === 'ring') {
        const geometry = ropeThrowGeometry(attacker, direction, defender);
        if (!geometry)
            return null;
        if (geometry.fellOut)
            return { location: geometry.destination, kind: 'outside' };
        if (geometry.cornerImpact)
            return { location: geometry.cornerLocation, kind: 'corner' };
        return { location: geometry.ropeLocation, kind: 'rope' };
    }
    if (attacker.area === 'ringside') {
        const geometry = ringsideThrowGeometry(attacker, direction);
        if (!geometry)
            return null;
        if (geometry.kind === 'corner-impact') {
            return {
                location: { area: 'corner', row: geometry.corner.r, column: geometry.corner.c },
                kind: 'corner',
            };
        }
        if ('destination' in geometry) {
            return {
                location: geometry.destination,
                kind: geometry.kind === 'ring-return' ? 'rope' : 'barrier',
            };
        }
        const vector = directionVector(direction);
        return {
            location: {
                area: 'ringside',
                row: attacker.row + vector.row,
                column: attacker.column + vector.column,
            },
            kind: 'barrier',
        };
    }
    return null;
}
function reboundPath(ropeLocation, returnLocation, direction) {
    const vector = ROPE_THROW_DIRECTIONS.find(({ facing }) => facing === direction);
    const path = [];
    let row = ropeLocation.row;
    let column = ropeLocation.column;
    while (row !== returnLocation.row || column !== returnLocation.column) {
        row -= vector.row;
        column -= vector.column;
        path.push({ area: 'ring', row, column });
    }
    return path;
}
const CORNER_MOVEMENT_RULES = [
    { ring: [0, 0], outer: [-1, -1], sides: [[-1, 0], [0, -1]] },
    { ring: [0, SIZE - 1], outer: [-1, SIZE], sides: [[-1, SIZE - 1], [0, SIZE]] },
    { ring: [SIZE - 1, 0], outer: [SIZE, -1], sides: [[SIZE, 0], [SIZE - 1, -1]] },
    { ring: [SIZE - 1, SIZE - 1], outer: [SIZE, SIZE], sides: [[SIZE, SIZE - 1], [SIZE - 1, SIZE]] },
];
const RINGSIDE_GAP_TARGETS = {
    0: [
        { label: 'A8', side: 'left', location: { area: 'ringside', row: 6, column: -1 } },
        { label: 'H1', side: 'right', location: { area: 'ringside', row: -1, column: 6 } },
    ],
    2: [
        { label: 'I2', side: 'left', location: { area: 'ringside', row: 0, column: SIZE } },
        { label: 'B9', side: 'right', location: { area: 'ringside', row: SIZE, column: 0 } },
    ],
};
function isAt(location, area, [row, column]) {
    return location.area === area && location.row === row && location.column === column;
}
function isBlockedCornerMove(from, to, rotation) {
    // A wrestler may drop from a height-2 post to ringside, but cannot climb
    // directly from height 0 back onto any post.
    if (from.area === 'ringside' && to.area === 'corner')
        return true;
    return CORNER_MOVEMENT_RULES.some(({ ring, outer, sides }) => {
        const fromRingCorner = isAt(from, 'ring', ring);
        const toRingCorner = isAt(to, 'ring', ring);
        const toOuterCorner = isAt(to, 'ringside', outer);
        const fromSide = sides.some((side) => isAt(from, 'ringside', side));
        const toSide = sides.some((side) => isAt(to, 'ringside', side));
        const outerCornerIsHidden = rotation === 0
            ? outer[0] === -1 && outer[1] === -1
            : outer[0] === SIZE && outer[1] === SIZE;
        // The post and ropes block movement between the height-1 ring corner and
        // its two adjacent height-0 squares. At floor level only the outer corner
        // hidden by the current view is exit-only; the other three remain open.
        return (fromRingCorner && toSide)
            || (fromSide && toRingCorner)
            || (outerCornerIsHidden && fromSide && toOuterCorner);
    });
}
function isDefaultHiddenRingside(location) {
    // A1 keeps the current view until the wrestler chooses B1 or A2.
    if (isAt(location, 'ringside', [-1, -1]))
        return false;
    return location.area === 'ringside' && ((location.column === -1 && location.row >= -1 && location.row <= 6)
        || (location.row === -1 && location.column >= 0 && location.column <= 6));
}
function isRotatedHiddenRingside(location) {
    // I9 likewise waits for the next step before deciding whether to turn back.
    if (isAt(location, 'ringside', [SIZE, SIZE]))
        return false;
    return location.area === 'ringside' && ((location.column === 7 && location.row >= 0 && location.row <= 7)
        || (location.row === 7 && location.column >= 0 && location.column <= 7));
}
function rotationAfterMove(current, from, location, otherLocation) {
    // Once both wrestlers are back on the ring, restore the familiar default
    // viewpoint instead of keeping a ringside-driven half-turn.
    if (location.area === 'ring' && otherLocation.area === 'ring')
        return 0;
    // A1 and I9 are the two view-dependent outer corners. Which exit turns the
    // board depends on the current view; the other exit stays in that view.
    const viewCorner = [
        { corner: [-1, -1], normalExit: [-1, 0], rotatedExit: [0, -1] },
        { corner: [SIZE, SIZE], normalExit: [SIZE - 1, SIZE], rotatedExit: [SIZE, SIZE - 1] },
    ].find(({ corner }) => isAt(from, 'ringside', corner));
    if (viewCorner) {
        const leavesByNormalExit = isAt(location, 'ringside', viewCorner.normalExit);
        const leavesByRotatedExit = isAt(location, 'ringside', viewCorner.rotatedExit);
        if (leavesByNormalExit || leavesByRotatedExit) {
            if (current === 0 && leavesByNormalExit)
                return 2;
            if (current === 2 && leavesByRotatedExit)
                return 0;
            return current;
        }
    }
    if (current === 0 && isDefaultHiddenRingside(location))
        return 2;
    if (current === 2 && isRotatedHiddenRingside(location))
        return 0;
    return current;
}
function isTransparentCorner(row, column, rotation) {
    return rotation === 0
        ? row === SIZE - 1 && column === SIZE - 1
        : row === 0 && column === 0;
}
function ropeUsedForMove(from, to) {
    if (from.area !== 'ring' || to.area !== 'ring')
        return null;
    if (from.column === 0 && to.column >= 2)
        return 'left';
    if (from.column === SIZE - 1 && to.column <= SIZE - 3)
        return 'right';
    if (from.row === 0 && to.row >= 2)
        return 'top';
    if (from.row === SIZE - 1 && to.row <= SIZE - 3)
        return 'bottom';
    return null;
}
function rotateFacingWithBoard(facing, rotation) {
    return TURN_ORDER[(TURN_ORDER.indexOf(facing) + rotation) % TURN_ORDER.length];
}
function rotateSurface(facing, surface) {
    const surfaceTurns = SURFACE_TURNS[surface];
    if (surface === 'top' || surface === 'bottom')
        return surface;
    const facingTurn = TURN_ORDER.indexOf(facing);
    return TURN_ORDER[(facingTurn + (surfaceTurns ?? 0)) % TURN_ORDER.length];
}
function projectCubeObject(facing, surface, u, v) {
    const targetSurface = rotateSurface(facing, surface);
    if (targetSurface === 'right-front') {
        return { x: 42 + 42 * u, y: 42 - 21 * u + 42 * v };
    }
    if (targetSurface === 'left-front') {
        return { x: 42 - 42 * u, y: 42 - 21 * u + 42 * v };
    }
    if (targetSurface === 'top') {
        const turn = TURN_ORDER.indexOf(facing);
        const topU = turn % 2 === 0 ? u : 1 - v;
        const topV = turn % 2 === 0 ? v : u;
        return { x: 42 + 42 * (topU - topV), y: 21 + 21 * (topU + topV) };
    }
    // A decal on the far or underside face remains attached, but is hidden by the cube.
    return null;
}
const diveFallbackLanding = (attacker, defender, vector, occupied, rng = Math.random) => {
    const rowDistance = Math.abs(defender.row - attacker.row);
    const columnDistance = Math.abs(defender.column - attacker.column);
    const distance = Math.max(rowDistance, columnDistance);
    if (distance === 2) {
        const between = locationForWorldCell(attacker.row + vector.row, attacker.column + vector.column);
        if (between && !isSameLocation(between, occupied))
            return between;
    }
    if (vector.row !== 0 && vector.column !== 0) {
        const diagonalSides = [
            locationForWorldCell(attacker.row, defender.column),
            locationForWorldCell(defender.row, attacker.column),
        ].filter((location) => Boolean(location) && !isSameLocation(location, occupied));
        return diagonalSides.length > 0 ? randomChoice(diagonalSides, rng) : null;
    }
    const lateral = [
        locationForWorldCell(defender.row - vector.column, defender.column + vector.row),
        locationForWorldCell(defender.row + vector.column, defender.column - vector.row),
    ].filter((location) => Boolean(location) && !isSameLocation(location, occupied));
    return lateral.length > 0 ? randomChoice(lateral, rng) : null;
};
export { ropeThrowGeometry, ringsideThrowGeometry, ropeDirectionTarget, isBlockedCornerMove, rotationAfterMove, ropeUsedForMove, locationHeight, cornerTopAttackVector, directionVector, locationForWorldCell, sameAreaLandingCandidates, diveFallbackLanding, forwardDistance };
