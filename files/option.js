const RimeURL = 'http://127.0.0.1:12346';

document.getElementById("pageSize").onchange = function () {
  window.localStorage.setItem("pageSize", this.value);
}

async function setSchema(schema) {
  let response = await fetch(
    RimeURL+'/schema/current',
    {
      method: "PUT",
      body: schema
    });
  let text = await response.text();
  window.localStorage.setItem("schema", text);
  window.localStorage.setItem("schema_change", "true");

  if (text == schema) {
    console.log(schema);
    location.reload();
  } else {
    document.getElementById(text).checked = true;
    if (schema != "") {
      alert("切换失败！");
    }
  }
}

async function getSchema() {
  let response = await fetch(RimeURL+'/schema/current');
  let text = await response.text();
  document.getElementById(text).checked = true;
}

document.getElementsByName("schema").forEach(function (ele) {
  ele.onclick = async function handleClick() {
    await setSchema(ele.value);
  }
})

function updateFuzzyCheckBox(options) {
  document.getElementsByName("fuzzy").forEach(function (ele) {
    if (options.includes(ele.value)) {
      ele.checked = true;
    } else {
      ele.checked = false;
    }
  })
}

async function addFuzzy(option) {
  let response = await fetch(
    RimeURL+'/algebra',
    {
      method: "POST",
      body: option
    });
  let text = await response.text();
  window.localStorage.setItem("schema_change", "true");
  updateFuzzyCheckBox(text.split("\n"));
  
}
async function removeFuzzy(option) {
  let response = await fetch(
    RimeURL+'/algebra',
    {
      method: "DELETE",
      body: option
    });
  let text = await response.text();
  window.localStorage.setItem("schema_change", "true");
  updateFuzzyCheckBox(text.split("\n"));
}
async function getFuzzy() {
  let response = await fetch(RimeURL+'/algebra');
  let text = await response.text();
  updateFuzzyCheckBox(text.split("\n"));
}


document.getElementsByName("fuzzy").forEach(function (ele) {
  ele.onclick = async function handleClick() {
    if (ele.checked) {
      await addFuzzy(ele.value);
    } else {
      await removeFuzzy(ele.value);
    }
  }
})


document.getElementById("pageSize").value = window.localStorage.getItem("pageSize") || 8;

getSchema();
getFuzzy();
