# NathanWu 人物插画头像（24 张）

> 使用确定性视觉签名与提示词；现有 PNG 是审核后的最终成品，图像生成结果不保证可逐像素复现。

## 目录结构

```
full/                    原图 1254×1254
avatar-512/              512×512 方图
avatar-round/            圆形裁切（256 与 64，外圈透明）
avatars-512.zip          导出包（方图、圆图与总览）
contact-sheet-round.png  圆形总览卡
```

## 24 张清单（按年龄排序）

2026-11-10：全部 24 张已使用 GPT Image 2 基于各自原图重新编辑生成，统一顶部留白至目标 7%（允许 6–8%，从最高发丝或头顶配饰起算）。11 位女性的现有提示词及元数据已统一明确无胡须；成品逐张目视检查无可见胡须残留。模型编辑后部分图片通过方形微裁切修正净空，再统一导出 1254 原图、512 方图及 256/64 圆图，压缩包和总览同步更新。留白为人工目视定位后的估算，未采用自动发丝分割测量。下表亮度与暗部数值保留自旧版，未重新测量，不代表本轮成品。

| 名字 | 性别 | 段 | 年龄 | 画风 | 底色 | 亮度 | 暗部% |
|---|---|---|---|---|---|---|---|
| Pip | masculine | 儿童 | 9 | crisp ink-line illustration with dense gouache washes that build up real depth | cool slate with paper grain | 66.4 | 66.9 |
| Soren | masculine | 青少年 | 17 | soft chalk pastel on dark tinted paper | pale terracotta gradient | 61.3 | 64.9 |
| Mira | feminine | 青少年 | 19 | textured acrylic portrait with palette-knife passages | pale ochre with grain | 78.4 | 58.3 |
| Maya | feminine | 青年 | 21 | charcoal and conté portrait with soft rubbed shadows and bright chalk highlights | muted lavender mist | 94.5 | 36.8 |
| Clara | feminine | 青年 | 23 | soft chalk pastel on dark tinted paper | soft peach wash | 95.4 | 38.8 |
| Hugo | masculine | 青年 | 23 | mid-century editorial illustration | dusty teal flat colour | 83.5 | 55.9 |
| Rin | androgynous | 青年 | 23 | crisp ink-line illustration with dense gouache washes that build up real depth | pale ochre with grain | 137.4 | 24.5 |
| Rosa | feminine | 青年 | 23 | textured acrylic portrait with palette-knife passages | pale ochre with grain | 105.3 | 34.6 |
| Dahlia | feminine | 青年 | 27 | crisp ink-line illustration with dense gouache washes that build up real depth | soft peach wash | 112.7 | 34.8 |
| Emil | masculine | 青年 | 27 | oil painting with visible directional brushwork | warm beige paper with subtle grain | 89.2 | 49.4 |
| Talia | feminine | 青年 | 27 | oil painting with visible directional brushwork | muted lavender mist | 76.7 | 51.8 |
| Arlo | masculine | 青年 | 28 | risograph-style portrait | cream with subtle warm texture | 147.0 | 25.1 |
| Cyrus | masculine | 青年 | 28 | pen-and-ink line drawing with dense cross-hatching that carries the shadows | pale terracotta gradient | 83.7 | 49.6 |
| Nina | feminine | 青年 | 28 | oil-painted editorial cover portrait | cool slate with paper grain | 43.3 | 82.5 |
| Sky | androgynous | 青年 | 29 | textured acrylic portrait with palette-knife passages | pale terracotta gradient | 108.4 | 30.7 |
| Lior | feminine | 青年 | 30 | charcoal and conté portrait with soft rubbed shadows and bright chalk highlights | soft peach wash | 63.7 | 62.6 |
| Teo | masculine | 青年 | 30 | oil-painted editorial cover portrait | matte off-white | 92.1 | 51.3 |
| Nikolai | masculine | 壮年 | 34 | mid-century editorial illustration | dusty teal flat colour | 77.3 | 57.7 |
| Pascal | masculine | 壮年 | 37 | pen-and-ink line drawing with dense cross-hatching that carries the shadows | soft sage with a hint of paper texture | 101.1 | 36.9 |
| Beatrix | feminine | 壮年 | 38 | soft chalk pastel on dark tinted paper | warm cinnamon haze | 55.7 | 74.9 |
| Cedric | masculine | 壮年 | 39 | risograph-style portrait | warm beige paper with subtle grain | 61.5 | 63.4 |
| Margot | feminine | 壮年 | 39 | rich gouache painting with visible brush strokes and layered opaque darks | dusty teal flat colour | 62.4 | 55.4 |
| Renate | feminine | 老年 | 61 | oil painting with visible directional brushwork | soft sage with a hint of paper texture | 55.1 | 65.8 |
| Maren | masculine | 高龄 | 80 | mid-century editorial illustration | warm cinnamon haze | 83.0 | 52.8 |


## 年龄段

| 段 | 年龄 |
|---|---|
| kid | 6~11 |
| teen | 14~19 |
| young | 21~32 |
| prime | 33~40 |
| mid | 38~53 |
| senior | 58~69 |
| elder | 72~80 |

## 统一构图标准

顶部净空目标为**最终方形画布总高度的 7%，允许 6–8%**。净空指最高发丝或头顶配饰（如推到头顶的眼镜、帽子，以最高者为准）到画布上边缘之间的连续背景；不得从额头或头皮起算。完整保留头部、头发和头顶配饰，头部水平居中，圆形裁切自然且不截头；原背景延伸至画布边缘，不加白边。

生成器使用 `code/portrait-style.mjs` 中的单一常量 `COMPOSITION_RULE`，由 `buildPrompt` 引用。`code/prompts/` 内所有已有的人物 txt（包括尚无成品的人物）均采用同一构图规则。2026-11-10 已按本规范完成现有 24 张成品的重新生成与各尺寸导出。

## 提示词工具（在项目根目录运行）

```bash
node code/portrait-style.mjs cards Maren:masculine:elder      # 查签名
node code/portrait-style.mjs prompt Renate:feminine:senior    # 出 prompt
node code/portrait-style.mjs batch ./prompts-new X:feminine:prime # 批量生成新人物提示词，写入独立目录
python3 code/tone-check.py outputs/portraits/full/Maya.png                    # 验明暗
```

后续批量生成新人物提示词可继续使用现有 `batch <输出目录> <Name:gender:band…>` 命令，它会自动带入统一构图标准；此命令仅写提示词，不生成图片。**不要对现有 `code/prompts/` 全量盲目运行 batch**：它按当前词池重新计算所有人物属性，覆盖同名 txt，并重写输出目录内的 `_signatures.json`，可能丢失人工调整的人物特征。已有角色仅需同步构图时，应只替换对应构图句；如需重新计算提示词，先输出到独立目录并逐一核对人物细节，也不要从旧元数据恢复已删人物。

名字格式：`Name:gender:band`。gender ∈ feminine/masculine/androgynous；band 见上表。

生成渠道：2026-11-10 批量修订使用 Alma 图像编辑命令，模型为 GPT Image 2；更早版本使用 ChatGPT 网页版。

## 本地导出

在项目根目录执行 `npm ci` 后运行 `npm run export`。输入以 `full/` 下的 PNG 为准，动态生成全部人物的 512 方图、256/64 圆图、总览和 ZIP；不会修改原图。详细参数及授权状态见项目根 README。

## 使用许可

代码、提示词和头像素材采用 [MIT License](../../LICENSE)，允许免费使用、修改、分享及商用；分发本项目或其重要部分时保留版权声明和许可文本。
