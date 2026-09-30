"""生成 / 校验 xlsx 测试夹具，用于交叉验证 lib/xlsx-read.ts 与 lib/xlsx-write.ts。

我们自己的读写实现是手写的（不引第三方表格库），所以需要用一个**独立的第三方实现**
来做交叉验证 —— openpyxl 就是那个「裁判」：

  gen    用 openpyxl 写出各种刁钻的 xlsx，再交给我们的解析器去读
  verify 用 openpyxl 读**我们自己生成**的 xlsx，确认产出的文件是合法的

两边都过，才能说明「别人写的文件我们读得对」且「我们写的文件别人读得了」。

用法::

    uv run --with openpyxl python scripts/xlsx-fixtures.py gen <目录>
    uv run --with openpyxl python scripts/xlsx-fixtures.py verify <xlsx文件>

配合 scripts/xlsx-selftest.ts 使用，完整流程见 README「验证 xlsx 读写」一节。
"""
import os
import sys

from openpyxl import Workbook, load_workbook

HEADER = ["number", "firstname", "lastname", "phonenumber", "email", "title", "companyname"]
DATA = [
    ["0001", "张三", "张", "13800000001", "z@x.com", "总经理", "甲公司"],
    ["0002", "李四", "李", "13800000002", "l@x.com", "CTO", "乙公司"],
    ["0003", "Alice", "Smith", "13800000003", "a@x.com", "CEO", "Acme, Inc."],
    ["0004", "Bob", "O'Brien", "13800000004", "b@x.com", "CFO", 'He said "hi"'],
]


def gen(out: str) -> None:
    os.makedirs(out, exist_ok=True)

    # 1) 常规：表头 + 中文 + 前导零（写成字符串，openpyxl 会走 inline/shared string）
    wb = Workbook()
    ws = wb.active
    ws.title = "名单"
    ws.append(HEADER)
    for row in DATA:
        ws.append(row)
    wb.save(os.path.join(out, "basic.xlsx"))

    # 2) 稀疏单元格：中间整列空着，验证按 r="E2" 这类引用定位列是否正确
    wb = Workbook()
    ws = wb.active
    ws.title = "Sparse"
    ws.cell(row=1, column=1, value="number")
    ws.cell(row=1, column=5, value="companyname")
    ws.cell(row=2, column=1, value="0001")
    ws.cell(row=2, column=5, value="只填了第一列和第五列")
    ws.cell(row=2, column=9, value="第九列")
    wb.save(os.path.join(out, "sparse.xlsx"))

    # 3) 第二个工作表才是名单：验证按 workbook.xml 的关系表找表，而不是写死 sheet1.xml
    wb = Workbook()
    notes = wb.active
    notes.title = "说明"
    notes.append(["这一页不是名单"])
    data_sheet = wb.create_sheet("名单")
    data_sheet.append(HEADER[:3])
    data_sheet.append(["0001", "张三", "张"])
    data_sheet.append(["0002", "李四", "李"])
    wb.save(os.path.join(out, "second-sheet.xlsx"))

    # 4) 数字型单元格：Excel 里没设文本格式时 0001 会变成 1，解析出来就是 "1"
    wb = Workbook()
    ws = wb.active
    ws.title = "Numeric"
    ws.append(["number", "firstname"])
    ws.append([1, "数字工号"])
    ws.append([2, "另一个"])
    wb.save(os.path.join(out, "numeric.xlsx"))

    # 5) 引号/逗号/换行：验证字段内容不会被误拆
    wb = Workbook()
    ws = wb.active
    ws.title = "Tricky"
    ws.append(["number", "companyname"])
    ws.append(["0001", "Acme, Inc."])
    ws.append(["0002", 'He said "hi"'])
    ws.append(["0003", "第一行\n第二行"])
    wb.save(os.path.join(out, "tricky.xlsx"))

    # 6) 尾部空行：Excel 常留一堆空行，验证会被裁掉
    wb = Workbook()
    ws = wb.active
    ws.title = "Trailing"
    ws.append(["number", "firstname"])
    ws.append(["0001", "张三"])
    for _ in range(20):
        ws.append([None, None])
    wb.save(os.path.join(out, "trailing.xlsx"))

    # 7) 中文 Windows 上 Excel 存 CSV 默认就是 GBK
    with open(os.path.join(out, "gbk.csv"), "w", encoding="gbk", newline="") as f:
        f.write(",".join(HEADER[:3]) + "\r\n")
        f.write("0001,张三,张\r\n")
        f.write("0002,李四,李\r\n")

    # 8) Excel 的「文本（制表符分隔）」导出是 UTF-16LE + Tab
    with open(os.path.join(out, "utf16.txt"), "w", encoding="utf-16", newline="") as f:
        f.write("\t".join(HEADER[:3]) + "\r\n")
        f.write("\t".join(["0003", "王五", "王"]) + "\r\n")

    print("fixtures written to", out)
    for name in sorted(os.listdir(out)):
        print("  ", name, os.path.getsize(os.path.join(out, name)))


def verify(path: str) -> None:
    wb = load_workbook(path)
    print("sheetnames:", wb.sheetnames)
    for name in wb.sheetnames:
        ws = wb[name]
        print(f"--- {name} (dims={ws.dimensions}, max_row={ws.max_row}, max_col={ws.max_column}) ---")
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 8)):
            values = [c.value for c in row]
            formats = {c.number_format for c in row if c.value is not None}
            print("   ", values, "| numFmt:", formats)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    action, target = sys.argv[1], sys.argv[2]
    if action == "gen":
        gen(target)
    elif action == "verify":
        verify(target)
    else:
        print(f"unknown action: {action}")
        sys.exit(1)
