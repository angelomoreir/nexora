import { describe, expect, it } from "vitest";
import { columnIndex, columnName, displayValue, evaluateSheet, parseCellKey } from "../src/lib/sheet-formula";

const run = (cells: Record<string, string>, fns = {}) => {
  const out = evaluateSheet(cells, fns);
  return (key: string) => displayValue(out[key] ?? null);
};

describe("sheet formula engine", () => {
  it("maps columns Excel-style", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(51)).toBe("AZ");
    expect(columnIndex("AA")).toBe(26);
    expect(parseCellKey("$B$12")).toEqual({ row: 11, col: 1 });
  });

  it("evaluates arithmetic with precedence, unary minus and percent", () => {
    const v = run({ A1: "10", A2: "20", A3: "=A1+A2", B1: "=2+3*4", B2: "=(2+3)*4", B3: "=-2^2", B4: "=2^3^2", B5: "=50%*A1", B6: "=0.1+0.2", B7: "=10/4" });
    expect(v("A3")).toBe("30");
    expect(v("B1")).toBe("14");
    expect(v("B2")).toBe("20");
    expect(v("B3")).toBe("4");
    expect(v("B4")).toBe("64");
    expect(v("B5")).toBe("5");
    expect(v("B6")).toBe("0.3");
    expect(v("B7")).toBe("2.5");
  });

  it("supports ranges and aggregates, ignoring text in ranges", () => {
    const v = run({ A1: "10", A2: "20", A3: "30", A4: "40", A5: "texto", B1: "=SUM(A1:A5)", B2: "=AVERAGE(A1:A4)", B3: "=MIN(A1:A4)", B4: "=MAX(A1:A4)", B5: "=COUNT(A1:A5)", B6: "=COUNTA(A1:A5)", B7: "=SUM($A$1:A2)", B8: "=MEDIAN(A1:A4)" });
    expect(v("B1")).toBe("100");
    expect(v("B2")).toBe("25");
    expect(v("B3")).toBe("10");
    expect(v("B4")).toBe("40");
    expect(v("B5")).toBe("4");
    expect(v("B6")).toBe("5");
    expect(v("B7")).toBe("30");
    expect(v("B8")).toBe("25");
  });

  it("accepts ; as argument separator (PT/EU convention) and is case-insensitive", () => {
    const v = run({ A1: "3", A2: "4", B1: "=sum(A1;A2)", B2: "=ROUND(2.567;2)", B3: '=if(A1>2;"sim";"não")' });
    expect(v("B1")).toBe("7");
    expect(v("B2")).toBe("2.57");
    expect(v("B3")).toBe("sim");
  });

  it("handles logic, text and comparison", () => {
    const v = run({ A1: "5", A2: "Nexora", B1: "=IF(AND(A1>1,A1<10),\"ok\",\"ko\")", B2: "=OR(FALSE,A1=5)", B3: "=NOT(A1=5)", B4: '=A2&" "&A1', B5: '=CONCAT("a",A1,"b")', B6: "=LEN(A2)", B7: "=UPPER(LEFT(A2,3))", B8: '=A2="nexora"', B9: "=MID(A2,2,3)" });
    expect(v("B1")).toBe("ok");
    expect(v("B2")).toBe("TRUE");
    expect(v("B3")).toBe("FALSE");
    expect(v("B4")).toBe("Nexora 5");
    expect(v("B5")).toBe("a5b");
    expect(v("B6")).toBe("6");
    expect(v("B7")).toBe("NEX");
    expect(v("B8")).toBe("TRUE");
    expect(v("B9")).toBe("exo");
  });

  it("supports conditional aggregates and lookups", () => {
    const cells = { A1: "Maçã", B1: "3", A2: "Pera", B2: "5", A3: "Maçã", B3: "7", A4: "Uva", B4: "1" };
    const v = run({ ...cells, D1: '=SUMIF(A1:A4,"Maçã",B1:B4)', D2: '=COUNTIF(B1:B4,">2")', D3: '=AVERAGEIF(A1:A4,"Maçã",B1:B4)', D4: '=VLOOKUP("Pera",A1:B4,2,FALSE)', D5: '=VLOOKUP("Kiwi",A1:B4,2,FALSE)', D6: '=IFERROR(D5,"n/d")' });
    expect(v("D1")).toBe("10");
    expect(v("D2")).toBe("3");
    expect(v("D3")).toBe("5");
    expect(v("D4")).toBe("5");
    expect(v("D5")).toBe("#N/A");
    expect(v("D6")).toBe("n/d");
  });

  it("reports Excel-style errors and detects cycles", () => {
    const v = run({ A1: "=1/0", A2: "=FOO(1)", A3: '="a"+1', A4: "=A5", A5: "=A4", A6: "=SUM(A1,1)", A7: "=(1+2", A8: "=VLOOKUP(1,B1:C2,5)" });
    expect(v("A1")).toBe("#DIV/0!");
    expect(v("A2")).toBe("#NAME?");
    expect(v("A3")).toBe("#VALUE!");
    expect(v("A4")).toBe("#CYCLE!");
    expect(v("A5")).toBe("#CYCLE!");
    expect(v("A6")).toBe("#DIV/0!");
    expect(v("A7")).toBe("#ERROR!");
    expect(v("A8")).toBe("#REF!");
  });

  it("treats empty references as zero and keeps plain values", () => {
    const v = run({ A1: "=Z99+1", A2: "olá", A3: "=A2" });
    expect(v("A1")).toBe("1");
    expect(v("A2")).toBe("olá");
    expect(v("A3")).toBe("olá");
  });

  it("calls custom (Nexora) functions with evaluated arguments", () => {
    const v = run({ A1: "=TASKSCOUNT()", A2: '=TASKSCOUNT("ABERTAS")', A3: "=TASKSCOUNT()*2", A4: "=TASKSCOUNT(1/0)" }, {
      TASKSCOUNT: (args: unknown[]) => (args[0] === "ABERTAS" ? 3 : 7)
    });
    expect(v("A1")).toBe("7");
    expect(v("A2")).toBe("3");
    expect(v("A3")).toBe("14");
    expect(v("A4")).toBe("#DIV/0!");
  });

  it("evaluates a full 100x26 sheet quickly", () => {
    const cells: Record<string, string> = {};
    for (let r = 1; r <= 100; r += 1) for (let c = 0; c < 26; c += 1) cells[`${columnName(c)}${r}`] = r === 1 ? String(c) : `=${columnName(c)}${r - 1}+1`;
    const start = performance.now();
    const out = evaluateSheet(cells);
    expect(displayValue(out.Z100!)).toBe("124");
    expect(performance.now() - start).toBeLessThan(500);
  });
});
