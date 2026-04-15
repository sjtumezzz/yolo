import xml.etree.ElementTree as ET
import os
#classes = ['person', 'hat']
classes = ['sound','bad']

def convert(size, box):
    """
    将标注的 xml 文件生成的【左上角x,左上角y,右下角x，右下角y】标注转换为yolov5训练的坐标
    :param size: 图片的尺寸： [w,h]
    :param box: anchor box 的坐标 [左上角x,左上角y,右下角x,右下角y,]
    :return: 转换后的 [x,y,w,h]
    """
    dw = 1./size[0]
    dh = 1./size[1]
    x = (box[0] + box[1])/2.0
    y = (box[2] + box[3])/2.0
    w = box[1] - box[0]
    h = box[3] - box[2]
    x = x*dw
    w = w*dw
    y = y*dh
    h = h*dh
    return (x,y,w,h)


def convert_annotation(image_id):  # 转换这一张图片的坐标表示方式（格式）,即读取xml文件的内容，计算后存放在txt文件中。
    in_file = open('D:\yolov5\spot_datasets/train\label_train/%s'%image_id,encoding='utf-8')
    image_id = image_id.split('.')[0]
    out_file = open('D:\yolov5\spot_datasets/train\labels\%s.txt' %image_id, 'w',encoding='utf-8')
    tree=ET.parse(in_file)
    root = tree.getroot()
    size = root.find('size')
    w = int(size.find('width').text)
    h = int(size.find('height').text)

    for obj in root.iter('object'):
        difficult = obj.find('difficult').text
        cls = obj.find('name').text
        if cls not in classes or int(difficult) == 1:
            continue
        cls_id = classes.index(cls)
        xmlbox = obj.find('bndbox')
        b = (float(xmlbox.find('xmin').text), float(xmlbox.find('xmax').text), float(xmlbox.find('ymin').text), float(xmlbox.find('ymax').text))
        bb = convert((w,h), b)
        out_file.write(str(cls_id) + " " + " ".join([str(a) for a in bb]) + '\n')


if not os.path.exists('D:\yolov5\spot_datasets/train\labels/'):
    os.makedirs('D:\yolov5\spot_datasets/train\labels/')  # 新建一个 labels 文件夹，用于存放yolo格式的标签文件：000001.txt
image_ids = open('D:\yolov5\spot_datasets/image_list.txt').read().strip().split()# 读取txt文件中 存放的图片的 id：000001
for image_id in image_ids:
    image_id = image_id+".xml"
    convert_annotation(image_id)  # 转换这一张图片的坐标表示方式（格式）



#################
# mode = 'train'
# path = 'D:\yolov5\VOC2028\ImageSets\Main/' + mode + '.txt'
# image_ids = open(path).read().strip().split()
# #print(image_ids)
# from shutil import copyfile
#
# for image_id in image_ids:
#     image_id_txt = image_id+".txt"
#     image_id_img = image_id + '.jpg'
#     copyfile('D:\yolov5\VOC2028\labels/' + image_id_txt, 'hat_datasets/' + mode + '/labels/' + image_id_txt)
#     copyfile('D:\yolov5\VOC2028\JPEGImages/' + image_id_img, 'hat_datasets/' + mode + '/images/' + image_id_img)
#





# import xml.etree.ElementTree as ET
# import pickle
# import os
# from os import listdir, getcwd
# from os.path import join
#
# sets = ['train', 'test', 'val']
# classes = ["duck", "sucker"]
#
#
# def convert(size, box):
#     dw = 1. / size[0]
#     dh = 1. / size[1]
#     x = (box[0] + box[1]) / 2.0
#     y = (box[2] + box[3]) / 2.0
#     w = box[1] - box[0]
#     h = box[3] - box[2]
#     x = x * dw
#     w = w * dw
#     y = y * dh
#     h = h * dh
#     return (x, y, w, h)
#
#
# def convert_annotation(image_id):
#     in_file = open('VOC2007/Annotations/%s.xml' % (image_id))
#     out_file = open('data/labels/%s.txt' % (image_id), 'w')
#     tree = ET.parse(in_file)
#     root = tree.getroot()
#     size = root.find('size')
#     w = int(size.find('width').text)
#     h = int(size.find('height').text)
#     for obj in root.iter('object'):
#         difficult = obj.find('difficult').text
#         cls = obj.find('name').text
#         if cls not in classes or int(difficult) == 1:
#             continue
#         cls_id = classes.index(cls)
#         xmlbox = obj.find('bndbox')
#         b = (float(xmlbox.find('xmin').text), float(xmlbox.find('xmax').text), float(xmlbox.find('ymin').text),
#              float(xmlbox.find('ymax').text))
#         bb = convert((w, h), b)
#         out_file.write(str(cls_id) + " " + " ".join([str(a) for a in bb]) + '\n')
#
#
# wd = getcwd()
# print(wd)
# for image_set in sets:
#     if not os.path.exists('data/labels/'):
#         os.makedirs('data/labels/')
#     image_ids = open('VOC2007/ImageSets/Main/%s.txt' % (image_set)).read().strip().split()
#     list_file = open('data/%s.txt' % (image_set), 'w')
#     for image_id in image_ids:
#         list_file.write('data/images/%s.jpg\n' % (image_id))
#         convert_annotation(image_id)
#     list_file.close()
