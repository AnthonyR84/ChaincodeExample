package main

import (
	"fmt"
	"github.com/hyperledger/fabric/core/chaincode/shim"
	pb "github.com/hyperledger/fabric/protos/peer"
)

type SimpleChaincode struct {
}

func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface) pb.Response {
	fmt.Println("helloworld2 init")
	var user string
	var err error

	user = "user1"
	err = stub.PutState(user, []byte("hello world !"))
	
	if err != nil {
		return shim.Error(err.Error())
	}

	return shim.Success([]byte("hello world !"))
}

func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface) pb.Response {
	fmt.Println("helloworld2 Invoke")
	function, args := stub.GetFunctionAndParameters()

	if function == "greetings" {
		return t.greetings(stub, args)
	} else {
		return t.Init(stub)
	}

	return shim.Error("Invalid invoke function name.")
}

func (t *SimpleChaincode) greetings(stub shim.ChaincodeStubInterface, args []string) pb.Response {
	fmt.Println("helloworld2 greetings")
	var user, greetings string
	var err error

	user = args[0]
	greetings = "hello " + args[0] + " !"
	fmt.Println(greetings)
	fmt.Println(user)
	err = stub.PutState(user, []byte(greetings))
	if err != nil {
		return shim.Error(err.Error())
	}

	return shim.Success([]byte(greetings))
}

func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}
