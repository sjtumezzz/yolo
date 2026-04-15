import matplotlib.pyplot as plt
import numpy as np

def create_box(ax, x, y, width, height, title, color='lightblue'):
    rect = plt.Rectangle((x, y), width, height, fill=True, facecolor=color, edgecolor='black')
    ax.add_patch(rect)
    ax.text(x+width/2, y+height/2, title, ha='center', va='center', wrap=True)

fig, ax = plt.subplots(figsize=(15, 10))

# 输入
create_box(ax, 0, 5, 2, 1, '时空特征 F')

# 编码器
create_box(ax, 3, 4, 2, 3, '编码器 E\n(5层CNN)', color='lightgreen')

# 潜在特征
create_box(ax, 6, 5, 2, 1, '潜在特征 z')

# 特征提取器
create_box(ax, 9, 7, 2, 1, '故障特征提取器 F_f')
create_box(ax, 9, 3, 2, 1, '工况特征提取器 F_c')

# 解耦特征
create_box(ax, 12, 7, 2, 1, '故障特征 z_f')
create_box(ax, 12, 3, 2, 1, '工况特征 z_c')

# 工况判别器
create_box(ax, 15, 5, 2, 1, '工况判别器 D_c')

# 特征重构解码器
create_box(ax, 15, 1, 2, 3, '特征重构解码器 R', color='lightyellow')

# 故障分类器
create_box(ax, 18, 7, 2, 1, '故障分类器 C_f')

# 输出
create_box(ax, 21, 7, 2, 1, '故障类别 y')
create_box(ax, 18, 2, 2, 1, '重构特征 F\'')

# 连接线
ax.annotate('', xy=(2, 5.5), xytext=(3, 5.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(5, 5.5), xytext=(6, 5.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(8, 5.5), xytext=(9, 7.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(8, 5.5), xytext=(9, 3.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(11, 7.5), xytext=(12, 7.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(11, 3.5), xytext=(12, 3.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(14, 7.5), xytext=(15, 5.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(14, 3.5), xytext=(15, 5.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(14, 7.5), xytext=(18, 7.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(14, 7.5), xytext=(15, 2.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(14, 3.5), xytext=(15, 2.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(17, 2.5), xytext=(18, 2.5), arrowprops=dict(arrowstyle='->'))
ax.annotate('', xy=(20, 7.5), xytext=(21, 7.5), arrowprops=dict(arrowstyle='->'))

ax.set_xlim(0, 23)
ax.set_ylim(0, 9)
ax.axis('off')

plt.title('对抗特征解耦网络')
plt.tight_layout()
plt.show()
