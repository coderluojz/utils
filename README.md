# utils

工具方法库

# git

```
git add .
git commit -m "feat: message"
git push
npm publish
```

# npm

```
npm login
npm version patch -m "feat: message"
git push --follow-tags
npm publish --access public
```

`--access public`: 如果你发布的是一个 scoped 包 (@scope/name)，npm 默认它是私有的。添加这个参数可以将其作为公共包免费发布。第一次发布 scoped 包时必须加
