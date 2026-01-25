from x27cn.minify import _mangle_variables

js = 'var name="x";var greeting="y"+name;'
print("输入:", js)
result = _mangle_variables(js)
print("输出:", result)

