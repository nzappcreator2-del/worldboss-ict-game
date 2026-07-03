import ts from 'typescript'

export function stripLegacyFunctions(source: string, names: string[]): string {
  const targets = new Set(names)
  const sourceFile = ts.createSourceFile('legacy.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const ranges = sourceFile.statements
    .filter((statement) => {
      if (ts.isFunctionDeclaration(statement)) return Boolean(statement.name && targets.has(statement.name.text))
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)) return false
      const assignment = statement.expression
      if (assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isPropertyAccessExpression(assignment.left)) return false
      return ts.isIdentifier(assignment.left.expression)
        && assignment.left.expression.text === 'window'
        && targets.has(assignment.left.name.text)
    })
    .map((statement) => ({ start: statement.getFullStart(), end: statement.end }))
    .sort((a, b) => b.start - a.start)

  return ranges.reduce((result, range) => result.slice(0, range.start) + result.slice(range.end), source)
}
